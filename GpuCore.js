/**
 * WebGPU Core Class
 * 
 * Defines the GPU class used in the HTML page and its methods.
 * This is the main context to which other objects refer.
 */


class WebGpu
{
    static ObjectType = Object.freeze({
        VISUAL: 0,
        SOLID: 1,
        TRIGGER: 2,
    });
    static TextureMode = Object.freeze({
        NONE: 0,
        AMBIENT:  1 << 0,
        DIFFUSE:  1 << 1,
        SPECULAR: 1 << 2,
        NORMAL:   1 << 3,
    });

    constructor() {
        this.Visual = [];
        this.Solid = [];
        this.Trigger = [];
        this.Keys = {};
        this.objectCounter = 0;
        this.isReady = false;
        this.gui = new GuiController();
        this.setupGpu().then(() => { this.slowStart(); });
    }

    async slowStart() {
     this.camera = new MovableCamera([0,0.5,15], [0,3.14159,0]);
        // this.camera = new MovableCamera([0,30,0], [3.14159/2,0,0]);
        this.lights = new LightSystem([0.3, 0.3, 0.3]);
        this.lights.addDirLight([1,-1,1], [0.5,0.5,0.5]);
        this.lights.addPointLight([0, 0, 0], [2,2,2]);
        this.lights.addSpotLight([0,10,0], [0,-1,0], [0.2,0.2,0.2], 0.1);
        this.root = new Root();

        var objects = [];
        for (const key of Constants.MODELS) {
            var importer = new WavefrontImporter();
            let parsed = await importer.parse('./Models/Static/' + key);
            objects = objects.concat(parsed);
        }
        console.log(objects);
        objects.forEach(o => this.createParentedObject(
            this.getObjectIdByName(o.parentName),
            WebGpu.ObjectType.VISUAL, DrawableWavefrontObject, 
            o.offset.loc, o.offset.rot, o.offset.scl, o
        ));

        var planets = [];
        for (const key of Constants.PLANETS) {
            var importer = new WavefrontImporter();
            let parsed = await importer.parse('./Models/Planet/' + key);
            planets.push(parsed);
        }
        console.log(planets);
        planets.forEach(p => Orrery.addPlanet(
            p, this.getObjectIdByName(p.parentName), WebGpu.ObjectType.VISUAL
        ));

        requestAnimationFrame(WebGpu.mainLoop);
    }

    async setupGpu() {
        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) throw new Error("No appropriate GPU adapter found.");
        this.device = await this.adapter.requestDevice();
        if (!this.device) throw new Error("Browser does not support WebGPU.");
        console.log("WebGPU device found.");

        // Configure WebGPU context from canvas
        this.canvas = document.querySelector("canvas");
        this.context = this.canvas.getContext("webgpu");
        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
        });
        console.log("Set up context with device and format.");

        // Create textures, depth buffers, and samplers
        this.depthTexture = this.device.createTexture({
            label: "Depth texture for rendering",
            size: [this.canvas.width, this.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.depthTextureView = this.depthTexture.createView();
        this.renderPassTexture = this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: this.presentationFormat,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.renderPassTextureView = this.renderPassTexture.createView();
        this.objectSampler = this.device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            magFilter: 'nearest',
            minFilter: 'linear',
        });
        this.genericSampler = this.device.createSampler({
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
            magFilter: 'linear',
            minFilter: 'linear'
        });

        // Create the rendering shaders
        let renderShaderCode = await fetch('RenderShaderModule.wgsl').then(f=>f.text());
        this.renderShaderModule = this.device.createShaderModule({
            label: "Render Shader",
            code: renderShaderCode,
        });
        let singularityShaderCode = await fetch("PostProcessShader.wgsl").then(f=>f.text());
        this.singularityShaderModule = this.device.createShaderModule({
            label: "Singularity Shader",
            code: singularityShaderCode,
        });
        console.log("Created the rendering shaders.");

        // Define the vertex buffer layout
        this.vertexBufferLayout = {
            arrayStride: Constants.OFFSET.VERTEX.STRIDE,
            attributes: [{
                // Position (vec3f)
                format: "float32x3",
                offset: Constants.OFFSET.VERTEX.POS,
                shaderLocation: 0,
            }, {
                // Normal (vec3f)
                format: "float32x3",
                offset: Constants.OFFSET.VERTEX.NML,
                shaderLocation: 1,
            }, {
                // UVs (vec2f)
                format: "float32x2",
                offset: Constants.OFFSET.VERTEX.UVS,
                shaderLocation: 2,
            }],
        }

        // Define bind group layouts since WebGPU cannot auto-identify layouts with textures
        this.objectBindGroupLayout = this.device.createBindGroupLayout({
            label: "Object bind group layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }, {
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                sampler: {},
            }, {
                binding: 2,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {},
            }, {
                binding: 3,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {},
            }, {
                binding: 4,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {},
            }, {
                binding: 5,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {},
            }],
        });
        this.lightBindGroupLayout = this.device.createBindGroupLayout({
            label: "Light bind group layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }],
        });
        this.sceneBindGroupLayout = this.device.createBindGroupLayout({
            label: "Scene bind group layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }],
        });
        this.singularityBindGroupLayout = this.device.createBindGroupLayout({
            label: "Singularity bind group layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {}
            }, {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            }],
        });

        // Define pipelines
        this.renderPipeline = this.device.createRenderPipeline({
            label: "Render Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.objectBindGroupLayout, this.lightBindGroupLayout, this.sceneBindGroupLayout],
            }),
            vertex: {
                module: this.renderShaderModule,
                entryPoint: "vertexMain",
                buffers: [this.vertexBufferLayout],
            },
            fragment: {
                module: this.renderShaderModule,
                entryPoint: "fragmentMain",
                targets: [{
                    format: this.presentationFormat
                }],
            },
            primitives: {
                topology: "triangle-list",
                cullMode: "back",
            },
            depthStencil: {
                format: "depth24plus",
                depthWriteEnabled: true,
                depthCompare: "less",
            },
        });
        this.singularityPipeline = this.device.createRenderPipeline({
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.singularityBindGroupLayout],
            }),
            vertex: {
                module: this.singularityShaderModule,
                entryPoint: "vertexMain",
                buffers: [{
                    // TODO
                    arrayStride: 4 * 4,
                    attributes: [{
                        shaderLocation: 0,
                        offset: 0,
                        format: "float32x4",
                    }],
                }],
            },
            fragment: {
                module: this.singularityShaderModule,
                entryPoint: "fragmentMain",
                targets: [{
                    format: this.presentationFormat
                }],
            }
        });
        console.log("Created the pipelines.");

        this.setupGlobals();

        this.isReady = true;
    }

    setupGlobals() {
        // Define global buffers for objects to use
        this.global_lightBuffer = this.device.createBuffer({
            label: "Global light buffer",
            size: Constants.SIZE.LIGHT_UNIFORM,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Define dummy buffers for objects to use
        this.dummy_objectBuffer = this.device.createBuffer({
            label: "Dummy object buffer",
            size: Constants.SIZE.OBJECT_UNIFORM,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        this.dummy_cameraBuffer = this.device.createBuffer({
            label: "Dummy camera buffer",
            size: Constants.SIZE.CAMERA_UNIFORM,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // TODO
        this.screenQuad = this.device.createBuffer({
            label: "Fullscreen quad",
            size: 6 * 4 * 4, // 6 vertices × vec4f
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
            this.screenQuad, 0,
            new Float32Array([
                -1, -1, 0, 1,
                1, -1, 0, 1,
                -1,  1, 0, 1,
                -1,  1, 0, 1,
                1, -1, 0, 1,
                1,  1, 0, 1,
            ])
        );

        // Define dummy textures for objects to use
        this.dummy_texture = this.device.createTexture({
            label: 'Global dummy/missing texture',
            size: [16, 16],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });
        this.device.queue.writeTexture(
            { texture: this.dummy_texture },
            new Uint8Array(WebGpu.createTextureMissing(16)),
            { bytesPerRow: 16 * 4 },
            { width: 16, height: 16 },
        );
        this.dummy_textureView = this.dummy_texture.createView();

        // Define global bind group layouts
        this.global_renderBindGroup0 = this.device.createBindGroup({
            label: "Global render pipeline object bind group",
            layout: this.renderPipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.dummy_objectBuffer },
            }, {
                binding: 1,
                resource: this.objectSampler,
            }, {
                binding: 2,
                resource: this.dummy_textureView,
            }, {
                binding: 3,
                resource: this.dummy_textureView,
            }, {
                binding: 4,
                resource: this.dummy_textureView,
            }, {
                binding: 5,
                resource: this.dummy_textureView,
            }],
        });
        this.global_renderBindGroup1 = this.device.createBindGroup({
            label: "Global render pipeline light bind group",
            layout: this.renderPipeline.getBindGroupLayout(1),
            entries: [{
                binding: 0,
                resource: { buffer: this.global_lightBuffer },
            }],
        })
        this.global_renderBindGroup2 = this.device.createBindGroup({
            label: "Global render pipeline scene bind group",
            layout: this.renderPipeline.getBindGroupLayout(2),
            entries: [{
                binding: 0,
                resource: { buffer: this.dummy_cameraBuffer },
            }],
        });
        this.global_singularityBindGroup0 = this.device.createBindGroup({
            label: "Global singularity pipeline singularity bind group",
            layout: this.singularityBindGroupLayout,
            entries: [{
                binding: 0,
                resource: this.genericSampler
            }, {
                binding: 1,
                resource: this.renderPassTextureView
            }],
        });

        console.log("Set up global buffers.");
    }

    updateAll() {
        // Update objects
        this.gui.update();
        this.camera.update();
        this.lights.update();
        this.root.update();
    }
    
    renderAll() {
        // Begin main rendering pass
        const renderEncoder = this.device.createCommandEncoder();
        const renderCommandPass = renderEncoder.beginRenderPass({
            label: "Rendering command pass",
            colorAttachments: [{
                view: this.renderPassTextureView,
                clearValue: Constants.COLOR.CLEAR_COLOR,
                loadOp: "clear",
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            }
        });
        renderCommandPass.setPipeline(this.renderPipeline);
        // Draw objects
        this.lights.render(renderCommandPass);
        this.camera.render(renderCommandPass);
        this.root.render(renderCommandPass);
        // End main rendering pass
        renderCommandPass.end();
        const renderCommands = renderEncoder.finish();

        // Begin singularity rendering pass
        const singularityEncoder = this.device.createCommandEncoder();
        const singularityRenderPass = singularityEncoder.beginRenderPass({
            label: "Singularity command pass",
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            }]
        });
        singularityRenderPass.setPipeline(this.singularityPipeline);
        // TODO
        singularityRenderPass.setBindGroup(0, this.global_singularityBindGroup0);
        singularityRenderPass.setVertexBuffer(0, this.screenQuad);
        // Draw objects
        singularityRenderPass.draw(6);
        // End singularity rendering pass
        singularityRenderPass.end();
        const singularityCommands = singularityEncoder.finish();

        // Submit commands
        this.device.queue.submit([renderCommands, singularityCommands]);
    }


    checkCollision(loc1, rad1, loc2, rad2) {
        // Return true if they collide, false if they don't.
        // You could also pass two objects in as well.
        return false;
    }

    createObject(type, prefab, ...args) {
        // We heard you liked sorcery, so we put darker sorcery on your dark sorcery.
        var temp = new prefab(...args);
        var id = "ID"+this.objectCounter;
        this.objectCounter++;
        temp.id = id;
        temp.prefab = prefab;
        switch (type) {
            case WebGpu.ObjectType.VISUAL:
                this.Visual[id] = temp;
                break;
            case WebGpu.ObjectType.SOLID:
                this.Solid[id] = temp;
                break;
            case WebGpu.ObjectType.TRIGGER:
                this.Trigger[id] = temp;
                break;
            default:
                break;
        }
        this.root.children.push(temp);
        // We can return the game object to the calling function
        // Should the user want to set custom names or properties on it.
        return temp;
    }

    createParentedObject(parentId, type, prefab, ...args) {
        var parent;
        if (parentId === null || parentId === undefined || parentId === "") {
            parent = this.root;
        } else {
            switch (type) {
                case WebGpu.ObjectType.VISUAL:
                    parent = this.Visual[parentId];
                    break;
                case WebGpu.ObjectType.SOLID:
                    parent = this.Solid[parentId];
                    break;
                case WebGpu.ObjectType.TRIGGER:
                    parent = this.Trigger[parentId];
                    break;
                default:
                    break;
            }
            if (parent === null || parent === undefined) {
                console.error("Parent ID ("+parentId+") not found. Object not created.");
                return undefined;
            }
        }
        var temp = new prefab(...args);
        var id = "ID"+this.objectCounter;
        this.objectCounter++;
        temp.id = id;
        temp.prefab = prefab;
        switch (type) {
            case WebGpu.ObjectType.VISUAL:
                this.Visual[id] = temp;
                break;
            case WebGpu.ObjectType.SOLID:
                this.Solid[id] = temp;
                break;
            case WebGpu.ObjectType.TRIGGER:
                this.Trigger[id] = temp;
                break;
            default:
                break;
        }
        parent.children.push(temp);
        return temp;
    }

    getObjectIdByName(name, type) {
        switch (type) {
            case WebGpu.ObjectType.VISUAL:
                for (const object of Object.values(this.Visual)) {
                    if (object.name !== undefined && object.name === name)
                        return object.id;
                }
                break;
            case WebGpu.ObjectType.SOLID:
                for (const object of Object.values(this.Solid)) {
                    if (object.name !== undefined && object.name === name)
                        return object.id;
                }
                break;
            case WebGpu.ObjectType.TRIGGER:
                for (const object of Object.values(this.Trigger)) {
                    if (object.name !== undefined && object.name === name)
                        return object.id;
                }
                break;
            default:
                for (const object of Object.values(this.Visual)) {
                    if (object.name !== undefined && object.name === name)
                        return object.id;
                }
                for (const object of Object.values(this.Solid)) {
                    if (object.name !== undefined && object.name === name)
                        return object.id;
                }
                for (const object of Object.values(this.Trigger)) {
                    if (object.name !== undefined && object.name === name)
                        return object.id;
                }
                break;
        }
        return undefined;
    }

    destroyObject(id) {
        if (id in this.Visual) {
            delete this.Visual[id];
        }
        if (id in this.Solid) {
            delete this.Solid[id];
        }
        if (id in this.Trigger) {
            delete this.Trigger[id];
        }
    }

    
    // Static callbacks go below here
    static keyD(event) {
        gpu.Keys[String.fromCharCode(event.keyCode)] = true;
    }
    static keyU(event) {
        gpu.Keys[String.fromCharCode(event.keyCode)] = false;
    }
    static mouseH(event) {
        var rect = canvas.getBoundingClientRect();
        var realX = event.clientX - rect.left;
        var realY = event.clientY - rect.top;
        var x = -1 + 2*realX/myCanvas.width;
        var y = -1 + 2*(myCanvas.height - realY)/myCanvas.height;
        // console.log(realX + "," + realY);
        // console.log("The click occurred on " + x + "," + y);
    }

    static createTextureMissing(size) {
        var ret = [];
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                if ((x < size/2 && y < size/2) || (x >= size/2 && y >= size/2))
                    ret.push(255,0,255,255);
                else
                    ret.push(0,0,0,0);
            }
        }
        return ret;
    }

    static mainLoop() {
        gpu.updateAll();
        gpu.renderAll();
        requestAnimationFrame(WebGpu.mainLoop);
    }
}