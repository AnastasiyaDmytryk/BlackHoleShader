class Skybox {
    constructor(gpu, urls) {
        this.gpu = gpu;
        this.device = gpu.device;

        const scale = 50; // Much bigger!
    this.vertices = new Float32Array([
        // Back face
        -1*scale, -1*scale, -1*scale,  1*scale, -1*scale, -1*scale,  1*scale,  1*scale, -1*scale,
        -1*scale, -1*scale, -1*scale,  1*scale,  1*scale, -1*scale, -1*scale,  1*scale, -1*scale,
        // Front face
        -1*scale, -1*scale,  1*scale,  1*scale, -1*scale,  1*scale,  1*scale,  1*scale,  1*scale,
        -1*scale, -1*scale,  1*scale,  1*scale,  1*scale,  1*scale, -1*scale,  1*scale,  1*scale,
        // Top face
        -1*scale,  1*scale, -1*scale,  1*scale,  1*scale, -1*scale,  1*scale,  1*scale,  1*scale,
        -1*scale,  1*scale, -1*scale,  1*scale,  1*scale,  1*scale, -1*scale,  1*scale,  1*scale,
        // Bottom face
        -1*scale, -1*scale, -1*scale,  1*scale, -1*scale, -1*scale,  1*scale, -1*scale,  1*scale,
        -1*scale, -1*scale, -1*scale,  1*scale, -1*scale,  1*scale, -1*scale, -1*scale,  1*scale,
        // Left face
        -1*scale, -1*scale, -1*scale, -1*scale,  1*scale, -1*scale, -1*scale,  1*scale,  1*scale,
        -1*scale, -1*scale, -1*scale, -1*scale,  1*scale,  1*scale, -1*scale, -1*scale,  1*scale,
        // Right face
         1*scale, -1*scale, -1*scale,  1*scale,  1*scale, -1*scale,  1*scale,  1*scale,  1*scale,
         1*scale, -1*scale, -1*scale,  1*scale,  1*scale,  1*scale,  1*scale, -1*scale,  1*scale
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
        
        console.log("Loading skybox textures...", urls);
        
        // Load all images - try multiple paths
        const bitmaps = await Promise.all(
            urls.map(async (u, index) => {
                // Try different possible paths
                const paths = [
                    u, // Try the URL as-is first
                    './Skybox/' + u.replace('./', ''),
                    './Models/Skybox/' + u.replace('./', ''),
                    './Textures/' + u.replace('./', '')
                ];
                
                for (const path of paths) {
                    try {
                        const response = await fetch(path);
                        if (response.ok) {
                            const blob = await response.blob();
                            console.log(`✓ Loaded skybox face ${index}: ${path}`);
                            return createImageBitmap(blob);
                        }
                    } catch (e) {
                        continue;
                    }
                }
                
                // If all paths fail, create a fallback colored texture
                console.warn(`✗ Could not load skybox image: ${u}, using fallback`);
                return this.createFallbackImage(256, index);
            })
        );
        
        const width = bitmaps[0].width;
        const height = bitmaps[0].height;
        
        console.log(`Creating cubemap texture: ${width}x${height}`);

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
            // Debug: check if bitmap has any color
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 10;
            testCanvas.height = 10;
            const testCtx = testCanvas.getContext('2d');
            testCtx.drawImage(bitmaps[i], 0, 0, 10, 10);
            const testData = testCtx.getImageData(0, 0, 10, 10);
            let hasColor = false;
            for (let j = 0; j < testData.data.length; j += 4) {
                if (testData.data[j] > 0 || testData.data[j+1] > 0 || testData.data[j+2] > 0) {
                    hasColor = true;
                    break;
                }
            }
            console.log(`Face ${i} has color:`, hasColor, `Sample pixel:`, 
                testData.data[0], testData.data[1], testData.data[2]);
            
            this.device.queue.copyExternalImageToTexture(
                { source: bitmaps[i] },
                { texture: texture, origin: [0, 0, i] },
                [width, height, 1]
            );
        }

        return texture.createView({ dimension: "cube" });
    }

    createFallbackImage(size, faceIndex = 0) {
        // Create a colored fallback image for each face
        const colors = [
            '#ff0000', // back - red
            '#00ff00', // bottom - green  
            '#0000ff', // front - blue
            '#ffff00', // left - yellow
            '#ff00ff', // right - magenta
            '#00ffff'  // top - cyan
        ];
        
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Fill with solid color for this face
        ctx.fillStyle = colors[faceIndex];
        ctx.fillRect(0, 0, size, size);
        
        // Add label
        ctx.fillStyle = '#ffffff';
        ctx.font = '48px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`Face ${faceIndex}`, size/2, size/2);
        
        return createImageBitmap(canvas);
    }

    createBindGroup() {
        if (!this.cubeView) {
            console.warn("Skybox: Cannot create bind group - cubeView not ready");
            return;
        }

        this.bindGroup = this.device.createBindGroup({
            layout: this.gpu.skyboxBindGroupLayout,
            entries: [
                { binding: 0, resource: this.cubeView },
                { binding: 1, resource: this.gpu.skyboxSampler }
            ]
        });
        
        console.log("✓ Skybox bind group created successfully");
    }

    render(pass) {
        // This is called from the render pass in GpuCore.js
        // The pass already has the pipeline and bind groups set
    }
}