class Skybox {
    constructor(gpu, urls) {
        this.gpu = gpu;
        this.device = gpu.device;
        

        this.vertices = new Float32Array([
            -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, -1, -1, 1, 1, -1, -1, 1, -1,
            -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, 1, 1,
            -1, -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, -1, -1, 1, 1, -1, -1, 1,
            1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, -1, 1, 1, 1, 1, -1, 1,
            -1, -1, -1, -1, -1, 1, 1, -1, 1, -1, -1, -1, 1, -1, 1, 1, -1, -1,
            -1, 1, -1, -1, 1, 1, 1, 1, 1, -1, 1, -1, 1, 1, 1, 1, 1, -1
        ]);

        this.vertexBuffer = this.device.createBuffer({
            size: this.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        this.device.queue.writeBuffer(this.vertexBuffer, 0, this.vertices);

        this.loadCubeFromURLs(urls)
            .then(textureView => {
                this.cubeView = textureView;
                this.createBindGroup();
            })
            .catch(err => console.error("Skybox load failed:", err));
    }

    async loadCubeFromURLs(urls) {
        if (urls.length !== 6) throw new Error("Skybox requires 6 URLs.");

        const bitmaps = await Promise.all(
            urls.map(u => fetch(u).then(r => r.blob()).then(b => createImageBitmap(b)))
        );

        const width = bitmaps[0].width;
        const height = bitmaps[0].height;

       const texture = this.device.createTexture({
    size: [width, height, 6],
    dimension: "2d", // <-- correct for cube layers
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
});


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
        if (!this.bindGroup) return;

        pass.setPipeline(this.gpu.skyboxPipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.setBindGroup(1, this.gpu.global_renderBindGroup2); // camera
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.draw(36);
    }
}
