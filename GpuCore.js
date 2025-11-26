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
        RENDER: 1,
        SINGULARITY: 2,
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
        this.gui = new SingularityGuiController();
        this.setupGpu().then(() => { this.slowStart(); });
    }

    async slowStart() {
        this.cameras = new CameraSystem();
        this.cameras.addCamera(MovableCamera, [0,0,20], [0,3.14159,0]); // 1
        this.cameras.addCamera(OrbitingCamera, [0,0,0], [0,0,0], 25); // 2
        this.cameras.addCamera(OrbitingCamera, [0,0,0], [0,0,0], 50); // 3
        this.cameras.addCamera(OrbitingCamera, [0,0,0], [0,0,0], 75); // 4
        this.cameras.addCamera(Camera, [0, 30,0], [3.14159/2,0,0]); // 5
        this.cameras.addCamera(Camera, [0, 60,0], [3.14159/2,0,0]); // 6
        this.cameras.addCamera(Camera, [0,100,0], [3.14159/2,0,0]); // 7

        this.lights = new LightSystem([0.3, 0.3, 0.3]);
        this.lights.addDirLight([1,-1,1], [0.5,0.5,0.5]);
        this.lights.addPointLight([0, 0, 0], [2,2,2]);
        this.lights.addSpotLight([0,10,0], [0,-1,0], [0.2,0.2,0.2], 0.1);

        this.singularity = new BlackHole([0,0,0], 6, 2, 100, 1, 1, 2);
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
        
        this.skybox = new Skybox(this, [
            "./bkg1_back.png","./bkg1_bot.png","./bkg1_front.png",
            "./bkg1_left.png","./bkg1_right.png","./bkg1_top.png"
        ]);
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

        // Define global textures
        this.setupTextures();

        // Define the rendering shaders
        let renderShaderCode = await fetch('RenderShaderModule.wgsl').then(f=>f.text());
        this.renderShaderModule = this.device.createShaderModule({
            label: "Render Shader",
            code: renderShaderCode,
        });
        let singularityShaderCode = await fetch("SingularityShaderModule.wgsl").then(f=>f.text());
        this.singularityShaderModule = this.device.createShaderModule({
            label: "Singularity Shader",
            code: singularityShaderCode,
        });
        console.log("Created the rendering shaders.");
        let skyboxShaderCode = await fetch("SkyboxShader.wgsl").then(r=>r.text());
        this.skyboxShaderModule = this.device.createShaderModule({
            label: "Skybox Shader",
            code: skyboxShaderCode,
        });


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
            }, {
                binding: 1,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }],
        });
        this.singularityBindGroupLayout = this.device.createBindGroupLayout({
            label: "Singularity bind group layout",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }, {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {}
            }, {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: { type: "comparison" },
            }, {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {}
            }, {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                texture: { sampleType: 'depth' },
            }],
        });

this.skyboxBindGroupLayout = this.device.createBindGroupLayout({
    label: "Skybox bind group layout",
    entries: [
        {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { viewDimension: "cube", sampleType: "float" }
        },
        {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: {}
        }
    ]
});

// ADD THIS NEW LAYOUT - just for skybox camera (only 1 binding)
this.skyboxCameraBindGroupLayout = this.device.createBindGroupLayout({
    label: "Skybox camera bind group layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: "uniform" },
    }]
});

// Create a sampler for skybox
this.skyboxSampler = this.device.createSampler({
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    magFilter: 'linear',
    minFilter: 'linear',
});

this.skyboxPipeline = this.device.createRenderPipeline({
    label: "Skybox Pipeline",
    layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.skyboxBindGroupLayout, this.skyboxCameraBindGroupLayout],
    }),
    vertex: {
        module: this.skyboxShaderModule,
        entryPoint: "vertexMain",
        buffers: [{
            arrayStride: 12,
            attributes: [{ 
                shaderLocation: 0, 
                offset: 0, 
                format: "float32x3" 
            }],
        }],
    },
    fragment: {
        module: this.skyboxShaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format: this.presentationFormat }],
    },
    primitive: { 
        topology: "triangle-list", 
        cullMode: "none" // CHANGED: Disable culling for debugging
    },
    depthStencil: { 
        format: "depth24plus", 
        depthWriteEnabled: false,
        depthCompare: "less-equal" // CHANGED: from "always"
    }
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
            label: "Singularity Pipeline",
            layout: this.device.createPipelineLayout({
                bindGroupLayouts: [this.singularityBindGroupLayout, this.sceneBindGroupLayout],
            }),
            vertex: {
                module: this.singularityShaderModule,
                entryPoint: "vertexMain",
                buffers: [this.vertexBufferLayout],
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
 



        // Define global buffers
        this.setupBuffers();
        this.setupGlobals();

        this.isReady = true;
    }

    setupTextures() {
    // Depth texture for render pass
    this.renderPassDepthTexture = this.device.createTexture({
        label: "Depth texture for rendering",
        size: [this.canvas.width, this.canvas.height],
        format: "depth24plus",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | 
               GPUTextureUsage.TEXTURE_BINDING | 
               GPUTextureUsage.COPY_DST, // Add COPY_DST
    });
    this.renderPassDepthTextureView = this.renderPassDepthTexture.createView();

    // Main render pass texture
    this.renderPassTexture = this.device.createTexture({
        size: [this.canvas.width, this.canvas.height],
        format: this.presentationFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | 
               GPUTextureUsage.TEXTURE_BINDING | 
               GPUTextureUsage.COPY_DST, // Add COPY_DST
    });
    this.renderPassTextureView = this.renderPassTexture.createView();

    // Samplers
    this.comparisonSampler = this.device.createSampler({ compare: "less" });
    this.genericSampler = this.device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear'
    });
    this.objectSampler = this.device.createSampler({
        addressModeU: 'repeat',
        addressModeV: 'repeat',
        magFilter: 'nearest',
        minFilter: 'linear',
    });

    // Dummy missing texture
    this.dummy_texture = this.device.createTexture({
        label: 'Global dummy/missing texture',
        size: [16, 16],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST, // Add COPY_DST
    });
    this.device.queue.writeTexture(
        { texture: this.dummy_texture },
        new Uint8Array(WebGpu.createTextureMissing(16)),
        { bytesPerRow: 16 * 4 },
        { width: 16, height: 16 }
    );
    this.dummy_textureView = this.dummy_texture.createView();

    console.log("Textures and samplers initialized.");
}

setupBuffers() {
    // Light buffer
    this.global_lightBuffer = this.device.createBuffer({
        label: "Global light buffer",
        size: Constants.SIZE.LIGHT_UNIFORM,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Debug buffer
    this.global_debugBuffer = this.device.createBuffer({
        label: "Global debug buffer",
        size: Constants.SIZE.DEBUG_UNIFORM,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Dummy object buffer
    this.dummy_objectBuffer = this.device.createBuffer({
        label: "Dummy object buffer",
        size: Constants.SIZE.OBJECT_UNIFORM,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

   
    this.dummy_cameraBuffer = this.device.createBuffer({
        label: "Dummy camera buffer",
        size: 128,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });


const testMatrices = new Float32Array([
    // View matrix (looking down -Z axis, camera at origin)
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
    
    // Projection matrix (perspective: FOV ~90°, aspect 1:1, near=0.1, far=100)
    1.0, 0, 0, 0,
    0, 1.0, 0, 0,
    0, 0, -1.002, -1.0,
    0, 0, -0.2002, 0,
]);
this.device.queue.writeBuffer(this.dummy_cameraBuffer, 0, testMatrices);

    this.dummy_singularityBuffer = this.device.createBuffer({
        label: "Dummy singularity buffer",
        size: Constants.SIZE.SINGULARITY_UNIFORM,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    console.log("Buffers initialized with correct sizes.");
}

    
    setupGlobals() {

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
            }, {
                binding: 1,
                resource: { buffer: this.global_debugBuffer },
            }],
        });
        this.global_singularityBindGroup0 = this.device.createBindGroup({
            label: "Global singularity pipeline singularity bind group",
            layout: this.singularityPipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.dummy_singularityBuffer },
            }, {
                binding: 1,
                resource: this.genericSampler,
            }, {
                binding: 2,
                resource: this.comparisonSampler,
            }, {
                binding: 3,
                resource: this.renderPassTextureView,
            }, {
                binding: 4,
                resource: this.renderPassDepthTextureView,
            }],
        });
        this.global_singularityBindGroup1 = this.device.createBindGroup({
            label: "Global singularity pipeline scene bind group",
            layout: this.singularityPipeline.getBindGroupLayout(1),
            entries: [{
                binding: 0,
                resource: { buffer: this.dummy_cameraBuffer },
            }, {
                binding: 1,
                resource: { buffer: this.global_debugBuffer },
            }],
        });
        this.global_skyboxCameraBG = this.device.createBindGroup({
        label: "Global skybox camera bind group",
        layout: this.skyboxCameraBindGroupLayout,
        entries: [{
            binding: 0,
            resource: { buffer: this.dummy_cameraBuffer },
        }],
    });


        console.log("Set up global bind groups.");
    }

    updateAll() {

        this.gui.update();
        this.cameras.update();
        this.lights.update();
        this.root.update();
        this.singularity.update();
    }
    
renderAll() {
    if (!this.isReady) return;
    this.updateAll();

    const encoder = this.device.createCommandEncoder();
    
    const activeCameraIndex = this.cameras.activeCamera || 0;
    const activeCamera = this.cameras.cameras[activeCameraIndex];
    const cameraBindGroup = activeCamera && activeCamera.renderBG2 
        ? activeCamera.renderBG2 
        : this.global_renderBindGroup2;
    
    // ===== TEST: Render skybox DIRECTLY to canvas =====
    {
        const skyboxPass = encoder.beginRenderPass({
            label: "Skybox Pass",
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(), // Direct to canvas
                clearValue: [1.0, 0.0, 1.0, 1.0], // Magenta for testing
                loadOp: "clear",
                storeOp: "store"
            }],
            depthStencilAttachment: { // ADD THIS BACK
                view: this.renderPassDepthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        skyboxPass.setPipeline(this.skyboxPipeline);
        skyboxPass.setBindGroup(1, this.global_skyboxCameraBG);

        if (this.skybox && this.skybox.bindGroup && this.skybox.vertexBuffer) {
            console.log("Drawing skybox..."); // Debug
            skyboxPass.setBindGroup(0, this.skybox.bindGroup);
            skyboxPass.setVertexBuffer(0, this.skybox.vertexBuffer);
            skyboxPass.draw(36);
        } else {
            console.log("Skybox not ready"); // Debug
        }

        skyboxPass.end();
    }

    
    /*// ===== 2. Scene Pass =====
    // Render scene objects on top of skybox
    {
        const scenePass = encoder.beginRenderPass({
            label: "Scene Pass",
            colorAttachments: [{
                view: this.renderPassTextureView,
                loadOp: "load", // Keep skybox - NO clearValue
                storeOp: "store"
            }],
            depthStencilAttachment: {
                view: this.renderPassDepthTextureView,
                depthLoadOp: "load", // Keep skybox depth
                depthStoreOp: "store"
            }
        });

        scenePass.setPipeline(this.renderPipeline);
        scenePass.setBindGroup(0, this.global_renderBindGroup0);
        scenePass.setBindGroup(1, this.global_renderBindGroup1);
        scenePass.setBindGroup(2, cameraBindGroup); // Use camera's bind group here too

        this.root.render(scenePass);
        this.lights.render(scenePass);
        this.cameras.render(scenePass);

        scenePass.end();
    }

    // ===== 3. Singularity Pass =====
    // Apply black hole effect and render to final canvas
    {
        const singularityPass = encoder.beginRenderPass({
            label: "Singularity Pass",
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: [0.0, 0.0, 0.0, 1.0], // Black background
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        singularityPass.setPipeline(this.singularityPipeline);
        singularityPass.setBindGroup(0, this.global_singularityBindGroup0);
        singularityPass.setBindGroup(1, cameraBindGroup); // Use camera's bind group here too

        this.cameras.render(singularityPass);
        this.singularity.render(singularityPass);

        singularityPass.end();
    }
*/
    // Submit all passes
    this.device.queue.submit([encoder.finish()]);
}

    checkCollision(loc1, rad1, loc2, rad2) {
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