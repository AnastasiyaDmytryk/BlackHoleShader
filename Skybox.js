class Skybox {
    constructor(gpu, urls) {
        this.gpu = gpu;
        this.device = gpu.device;

        // Correct cube vertices for skybox (6 faces, 6 vertices each = 36 total)
        this.vertices = new Float32Array([
            // Back face
            -1, -1, -1,  1, -1, -1,  1,  1, -1,
            -1, -1, -1,  1,  1, -1, -1,  1, -1,
            // Front face
            -1, -1,  1,  1, -1,  1,  1,  1,  1,
            -1, -1,  1,  1,  1,  1, -1,  1,  1,
            // Top face
            -1,  1, -1,  1,  1, -1,  1,  1,  1,
            -1,  1, -1,  1,  1,  1, -1,  1,  1,
            // Bottom face
            -1, -1, -1,  1, -1, -1,  1, -1,  1,
            -1, -1, -1,  1, -1,  1, -1, -1,  1,
            // Left face
            -1, -1, -1, -1,  1, -1, -1,  1,  1,
            -1, -1, -1, -1,  1,  1, -1, -1,  1,
            // Right face
             1, -1, -1,  1,  1, -1,  1,  1,  1,
             1, -1, -1,  1,  1,  1,  1, -1,  1
        ]);

        this.vertexBuffer = this.device.createBuffer({
            size: this.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, this.vertices);

        // Load cubemap texture
        this.loadCubeFromURLs(urls)
            .then(textureView => {
                this.cubeView = textureView;
                this.createBindGroup();
            })
            .catch(err => console.error("Skybox load failed:", err));
    }

    async loadCubeFromURLs(urls) {
        if (urls.length !== 6) throw new Error("Skybox requires 6 URLs.");
        
        // Load all images
        const bitmaps = await Promise.all(
            urls.map(u => fetch('./Skybox/' + u)
                .then(r => r.blob())
                .then(b => createImageBitmap(b))
            )
        );
        
        const width = bitmaps[0].width;
        const height = bitmaps[0].height;

        // Create texture with proper usage flags
        const texture = this.device.createTexture({
            size: [width, height, 6],
            dimension: "2d",
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | 
                   GPUTextureUsage.COPY_DST | 
                   GPUTextureUsage.RENDER_ATTACHMENT
        });

        // Copy each face to the texture
        for (let i = 0; i < 6; i++) {
            this.device.queue.copyExternalImageToTexture(
                { source: bitmaps[i] },
                { texture: texture, origin: [0, 0, i] },
                [width, height, 1]
            );
        }

        return texture.createView({ dimension: "cube" });
    }

    createBindGroup() {
        if (!this.cubeView) return;

        this.bindGroup = this.device.createBindGroup({
            layout: this.gpu.skyboxBindGroupLayout,
            entries: [
                { binding: 0, resource: this.cubeView },
                { binding: 1, resource: this.gpu.skyboxSampler }
            ]
        });
    }

    render(pass) {
        // This is called from the render pass in GpuCore.js
        // The pass already has the pipeline and bind groups set
    }
}