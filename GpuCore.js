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
    static RenderPass = Object.freeze({
        NONE: 0,
        SHADOW: 1,
        RENDER: 2,
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
        this.setupGpu().then(() => { this.slowStart(); });
    }

    async slowStart() {
        // Create boilerplate objects
        this.camera = new MovableCamera([0,0.5,2.5], [0,3.14159,0]);
        this.lights = new LightSystem([0.3, 0.3, 0.3]);
        this.lights.addDirLight([1,-1,1], [0.5,0.5,0.5]);
        this.lights.addPointLight([-3, 3, -3], [0.8,0.8,0.8]);
        this.lights.addSpotLight([0,10,0], [0,-1,0], [0.2,0.2,0.2], 0.87);
        this.root = new Root();

        var objects = []
        for (const key of Constants.MODELS) {
            var importer = new WavefrontImporter();
            let parsed = await importer.parse('./Models/' + key);
            objects = objects.concat(parsed);
        }
        console.log(objects);
        objects.forEach(o => this.createObject(
            WebGpu.ObjectType.VISUAL, DrawableWavefrontObject, 
            o.offset.loc, o.offset.rot, o.offset.scl, o
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
        this.shadowPointDepthTexture = this.device.createTexture({
            label: "Depth texture for point shadows",
            size: [this.canvas.width * 2, this.canvas.height * 2, Constants.MAX_LIGHT_NUM.POINT*6],
            format: "depth32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.shadowPointDepthTextureCubeArrayView = this.shadowPointDepthTexture.createView({ dimension: "cube-array" });
        this.shadowSpotDepthTexture = this.device.createTexture({
            label: "Depth texture for spot shadows",
            size: [this.canvas.width * 2, this.canvas.height * 2, Constants.MAX_LIGHT_NUM.SPOT*6],
            format: "depth32float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        this.shadowSpotDepthTextureCubeArrayView = this.shadowSpotDepthTexture.createView({ dimension: "cube-array" });
        this.shadowDepthTextureSampler = this.device.createSampler({ compare: "less" });
        this.objectSampler = this.device.createSampler({
            addressModeU: 'repeat',
            addressModeV: 'repeat',
            magFilter: 'nearest',
            minFilter: 'linear',
        });

        // Create a basic shader
        let shaderCode = await fetch('ShaderModule.wgsl').then(f=>f.text());
        this.cellShaderModule = this.device.createShaderModule({
            label: "Simple Shader",
            code: shaderCode,
        });
        console.log("Created a simple shader.");

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
                buffer: { type: "uniform" },
            }, {
                binding: 2,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                sampler: {},
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
            }, {
                binding: 6,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: {},
            }],
        });
        this.sceneBindGroupLayout = this.device.createBindGroupLayout({
            label: "Scene bind group layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }, {
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }],
        });
        this.shadowBindGroupLayout = this.device.createBindGroupLayout({
            label: "Shadow bind group layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                sampler: { type: "comparison" },
            }, {
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: { sampleType: "depth", viewDimension: "cube-array" },
            }, {
                binding: 2,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                texture: { sampleType: "depth", viewDimension: "cube-array" },
            }]
        });

        // Create the pipelines
        this.pipeline = this.device.createRenderPipeline({
            label: "Simple Pipeline",
            // Main render pass needs a manual layout because it reads from the shadow depth texture
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.objectBindGroupLayout, this.sceneBindGroupLayout, this.shadowBindGroupLayout],
            }),
            vertex: {
                module: this.cellShaderModule,
                entryPoint: "vertexMain",
                buffers: [this.vertexBufferLayout],
            },
            fragment: {
                module: this.cellShaderModule,
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
        this.shadowPipeline = this.device.createRenderPipeline({
            label: "Shadow Pipeline",
            // Shadow render pass can use auto layout because it uses uniforms only
            layout: "auto",
            vertex: {
                module: this.cellShaderModule,
                entryPoint: "vertexShadow",
                buffers: [this.vertexBufferLayout],
            },
            depthStencil: {
                format: "depth32float",
                depthWriteEnabled: true,
                depthCompare: "less",
            },
        });
        console.log("Created a pipeline.");

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
        this.global_shadowBuffer = this.device.createBuffer({
            label: "Global shadow buffer",
            size: Constants.SIZE.SHADOW_UNIFORM,
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
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.dummy_objectBuffer },
            }, {
                binding: 1,
                resource: { buffer: this.global_lightBuffer },
            }, {
                binding: 2,
                resource: this.objectSampler,
            }, {
                binding: 3,
                resource: this.dummy_textureView,
            }, {
                binding: 4,
                resource: this.dummy_textureView,
            }, {
                binding: 5,
                resource: this.dummy_textureView,
            }, {
                binding: 6,
                resource: this.dummy_textureView,
            }],
        });
        this.global_renderBindGroup1 = this.device.createBindGroup({
            label: "Global render pipeline scene bind group",
            layout: this.pipeline.getBindGroupLayout(1),
            entries: [{
                binding: 0,
                resource: { buffer: this.dummy_cameraBuffer },
            }, {
                binding: 1,
                resource: { buffer: this.global_shadowBuffer },
            }],
        });
        this.global_renderBindGroup2 = this.device.createBindGroup({
            label: "Global render pipeline shadow bind group",
            layout: gpu.pipeline.getBindGroupLayout(2),
            entries: [{
                binding: 0,
                resource: this.shadowDepthTextureSampler,
            }, {
                binding: 1,
                resource: this.shadowPointDepthTextureCubeArrayView,
            }, {
                binding: 2,
                resource: this.shadowSpotDepthTextureCubeArrayView,
            }],
        });
        this.global_shadowBindGroup0 = this.device.createBindGroup({
            label: "Global shadow pipeline object bind group",
            layout: this.shadowPipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.dummy_objectBuffer },
            }, {
                binding: 1,
                resource: { buffer: this.global_lightBuffer },
            }],
        });
        this.global_shadowBindGroup1 = this.device.createBindGroup({
            label: "Global shadow pipeline scene bind group",
            layout: this.shadowPipeline.getBindGroupLayout(1),
            entries: [{
                binding: 1,
                resource: { buffer: this.global_shadowBuffer },
            }],
        });

        console.log("Set up global buffers.");
    }

    updateAll() {
        // Update objects
        this.camera.update();
        this.lights.update();
        this.root.update();
    }
    
    renderAll() {
        this.renderPass = WebGpu.RenderPass.NONE;
        this.renderPassNum = 0;
        var encoder = undefined;
        var commandBuffer = undefined;
        var shadowCommandPass = undefined, renderCommandPass = undefined;
        
        // Begin shadow passes for cubemap renders
        this.renderPass = WebGpu.RenderPass.SHADOW;
        // Begin point light passes
        this.device.queue.writeBuffer(this.global_shadowBuffer, Constants.OFFSET.SHADOW_UNIFORM.ARRAY, new Uint32Array([0]));
        for (let light = 0; light < Constants.MAX_LIGHT_NUM.SHADOWED_POINT; light++) {
            for (let face = 0; face < 6; face++) {
                // Begin shadow pass
                this.device.queue.writeBuffer(this.global_shadowBuffer, Constants.OFFSET.SHADOW_UNIFORM.INDEX, new Uint32Array([light]));
                this.device.queue.writeBuffer(this.global_shadowBuffer, Constants.OFFSET.SHADOW_UNIFORM.PASS_DIR, new Uint32Array([face]));
                encoder = this.device.createCommandEncoder();
                shadowCommandPass = encoder.beginRenderPass({
                    label: "Point shadow command pass " + light + " " + face,
                    colorAttachments: [],
                    depthStencilAttachment: {
                        view: this.shadowPointDepthTexture.createView({ dimension: "2d", baseArrayLayer: light*6 + face }),
                        depthClearValue: 1.0,
                        depthLoadOp: "clear",
                        depthStoreOp: "store",
                    },
                });
                shadowCommandPass.setPipeline(this.shadowPipeline);
                // Draw objects
                this.lights.render(shadowCommandPass);
                this.root.render(shadowCommandPass);
                // End shadow pass
                shadowCommandPass.end();
                commandBuffer = encoder.finish();
                this.device.queue.submit([commandBuffer]);
            }
        }
        // Begin spot light passes
        this.device.queue.writeBuffer(this.global_shadowBuffer, Constants.OFFSET.SHADOW_UNIFORM.ARRAY, new Uint32Array([1]));
        for (let light = 0; light < Constants.MAX_LIGHT_NUM.SHADOWED_SPOT; light++) {
            for (let face = 0; face < 6; face++) {
                // Begin shadow pass
                this.device.queue.writeBuffer(this.global_shadowBuffer, Constants.OFFSET.SHADOW_UNIFORM.INDEX, new Uint32Array([light]));
                this.device.queue.writeBuffer(this.global_shadowBuffer, Constants.OFFSET.SHADOW_UNIFORM.PASS_DIR, new Uint32Array([face]));
                encoder = this.device.createCommandEncoder();
                shadowCommandPass = encoder.beginRenderPass({
                    label: "Spot shadow command pass " + light + " " + face,
                    colorAttachments: [],
                    depthStencilAttachment: {
                        view: this.shadowSpotDepthTexture.createView({ dimension: "2d", baseArrayLayer: light*6 + face }),
                        depthClearValue: 1.0,
                        depthLoadOp: "clear",
                        depthStoreOp: "store",
                    },
                });
                shadowCommandPass.setPipeline(this.shadowPipeline);
                // Draw objects
                this.lights.render(shadowCommandPass);
                this.root.render(shadowCommandPass);
                // End shadow pass
                shadowCommandPass.end();
                commandBuffer = encoder.finish();
                this.device.queue.submit([commandBuffer]);
            }
        }

        // Begin main rendering pass
        this.renderPass = WebGpu.RenderPass.RENDER;
        this.renderPassNum = 0;
        this.device.queue.writeBuffer(this.global_shadowBuffer, Constants.OFFSET.SHADOW_UNIFORM.PASS_DIR, new Uint32Array([this.renderPassNum]));
        encoder = this.device.createCommandEncoder();
        renderCommandPass = encoder.beginRenderPass({
            label: "Rendering command pass",
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: Constants.COLOR.CLEAR_COLOR,
                loadOp: "clear",
                storeOp: "store",
            }],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store",
            },
        });
        renderCommandPass.setPipeline(this.pipeline);
        // Draw objects
        this.lights.render(renderCommandPass);
        this.camera.render(renderCommandPass);
        this.root.render(renderCommandPass);
        // End main rendering pass
        renderCommandPass.end();
        commandBuffer = encoder.finish();
        this.device.queue.submit([commandBuffer]);

        this.renderPass = WebGpu.RenderPass.NONE;
        this.renderPassNum = 0;
    }

    checkCollision(loc1, rad1, loc2, rad2) {
        // Return true if they collide, false if they don't.
        // You could also pass two objects in as well.
        return false;
    }

    createObject(type, prefab, ...args) {
        // We heard you liked sorcery, so we put darker sorcery on your dark sorcery.
        var temp = new prefab(...args);
        var id = "ID"+this.ObjectCounter;
        this.ObjectCounter++;
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
        var id = "ID"+this.ObjectCounter;
        this.ObjectCounter++;
        temp.id = id;
        temp.prefab = prefab;
        parent.children.push(temp);
        return temp;
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