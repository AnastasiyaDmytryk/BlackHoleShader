/**
 * Renderable Game Objects
 * 
 * Objects which perform render operations that rely on the GPU structure.
 * Any class that overrides render(), as well as children of such classes,
 * should be placed here.
 */


class Camera extends CameraBase
{
    constructor(loc, rot) {
        super(loc, rot);

        this.cameraUniformBufferSize = Constants.SIZE.CAMERA_UNIFORM;
        this.cameraUniformBuffer = gpu.device.createBuffer({
            label: "Local camera buffer",
            size: this.cameraUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.renderBG2 = gpu.device.createBindGroup({
            label: "Local Camera render bind group 2",
            layout: gpu.renderPipeline.getBindGroupLayout(2),
            entries: [{
                binding: 0,
                resource: { buffer: this.cameraUniformBuffer },
            }, {
                binding: 1,
                resource: { buffer: gpu.global_debugBuffer },
            }],
        });
        this.singularityBG1 = gpu.device.createBindGroup({
            label: "Local Camera singularity bind group 1",
            layout: gpu.singularityPipeline.getBindGroupLayout(1),
            entries: [{
                binding: 0,
                resource: { buffer: this.cameraUniformBuffer },
            }, {
                binding: 1,
                resource: { buffer: gpu.global_debugBuffer },
            }],
        });

        gpu.device.queue.writeBuffer(this.cameraUniformBuffer, Constants.OFFSET.CAMERA_UNIFORM.TRANSLATION, new Float32Array(this.loc));
        gpu.device.queue.writeBuffer(this.cameraUniformBuffer, Constants.OFFSET.CAMERA_UNIFORM.ROTATION, new Float32Array(this.rot));
    }

    setBindGroups(commandPass) {
        if (gpu.renderPass === WebGpu.RenderPass.RENDER)
            commandPass.setBindGroup(2, this.renderBG2);
        else if (gpu.renderPass === WebGpu.RenderPass.SINGULARITY)
            commandPass.setBindGroup(1, this.singularityBG1);
    }

    update() {}

    render(commandPass) {
        // Render self
        this.setBindGroups(commandPass);
        gpu.device.queue.writeBuffer(this.cameraUniformBuffer, Constants.OFFSET.CAMERA_UNIFORM.TRANSLATION, new Float32Array(this.loc));
        gpu.device.queue.writeBuffer(this.cameraUniformBuffer, Constants.OFFSET.CAMERA_UNIFORM.ROTATION, new Float32Array(this.rot));
    }
}

class MovableCamera extends Camera
{
    update() {
        // Update self
        var vdelta = 0.25, rdelta = 0.05;
        if (gpu.Keys[String.fromCharCode(187)]) vdelta *= 10, rdelta *= 5;
        else if (gpu.Keys[String.fromCharCode(189)]) vdelta /= 10, rdelta /= 10;
        // X-Z plane movement
        if (gpu.Keys['W'] && !gpu.Keys['S']) {
            this.velocity[0] = vdelta * Math.sin(this.rot[1]);
            this.velocity[2] = vdelta * Math.cos(this.rot[1]);
        } else if (gpu.Keys['S'] && !gpu.Keys['W']) {
            this.velocity[0] = -vdelta * Math.sin(this.rot[1]);
            this.velocity[2] = -vdelta * Math.cos(this.rot[1]);
        } else {
            this.velocity[0] = 0;
            this.velocity[2] = 0;
        }
        // Y axis movement
        if (gpu.Keys['Q'] && !gpu.Keys['E']) this.velocity[1] = vdelta;
        else if (gpu.Keys['E'] && !gpu.Keys['Q']) this.velocity[1] = -vdelta;
        else this.velocity[1] = 0;
        // Y axis rotation
        if (gpu.Keys['D'] && !gpu.Keys['A']) this.angVelocity[1] = rdelta;
        else if (gpu.Keys['A'] && !gpu.Keys['D']) this.angVelocity[1] = -rdelta;
        else this.angVelocity[1] = 0;
        // Update position
        this.move();
    }
}

class OrbitingCamera extends Camera
{
    constructor(loc, rot, radius) {
        super(loc, rot);
        this.radius = radius;
    }

    update() {
        // Update self
        var rdelta = 0.003 / (this.radius / 10);
        this.rot[1] += rdelta;
        this.loc[0] = -this.radius * Math.sin(this.rot[1]);
        this.loc[2] = -this.radius * Math.cos(this.rot[1]);
        // Update position
        this.move();
    }

}

class CameraSystem
{
    constructor() {
        this.cameras = [];
        this.maxCameras = 9;
        this.currentCamera = undefined;
    }

    addCamera(prefab, ...args) {
        if (this.cameras.length >= this.maxCameras) return undefined;
        var cam = new prefab(...args);
        this.cameras.push(cam);
        if (this.currentCamera === undefined) this.currentCamera = cam;
        return cam;
    }

    getCamera(index) {
        return this.cameras[index];
    }

    update() {
        this.cameras.forEach(cam => cam.update());
        for (let i = this.maxCameras - 1; i >= 0; i--) {
            if (gpu.Keys[(i+1).toString()]) this.currentCamera = this.cameras[i];
        }
    }

    render(commandPass) {
        if (this.currentCamera !== undefined)
            this.currentCamera.render(commandPass);
    }
}


class Light extends LightBase
{
    constructor(loc, dir, col) {
        super(loc, dir, col);
        this.lightUniformBuffer = gpu.global_lightBuffer;
    }
}

class DirectionalLight extends Light
{
    constructor(dir, col, idx) {
        super([0,0,0], dir, col);
        this.index = idx;
    }

    update() {}

    render(commandPass) {
        var stride = Constants.SIZE.DIR_LIGHT;
        var arrStart = Constants.OFFSET.LIGHT_UNIFORM.DIR_LIGHTS;
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, arrStart + stride*this.index + Constants.OFFSET.DIR_LIGHT.DIRECTION, new Float32Array(this.direction));
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, arrStart + stride*this.index + Constants.OFFSET.DIR_LIGHT.COLOR, new Float32Array(this.color));
    }
}

class PointLight extends Light
{
    constructor(loc, col, idx) {
        super(loc, [0,0,0], col);
        this.index = idx;
    }

    update() {}

    render(commandPass) {
        var stride = Constants.SIZE.POINT_LIGHT;
        var arrStart = Constants.OFFSET.LIGHT_UNIFORM.POINT_LIGHTS;
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, arrStart + stride*this.index + Constants.OFFSET.POINT_LIGHT.POSITION, new Float32Array(this.loc));
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, arrStart + stride*this.index + Constants.OFFSET.POINT_LIGHT.COLOR, new Float32Array(this.color));
    }
}

class SpotLight extends Light
{
    constructor(loc, dir, col, cut, idx) {
        super(loc, dir, col);
        this.cutoff = cut;
        this.index = idx;
    }

    update() {}

    render(commandPass) {
        var stride = Constants.SIZE.SPOT_LIGHT;
        var arrStart = Constants.OFFSET.LIGHT_UNIFORM.SPOT_LIGHTS;
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, arrStart + stride*this.index + Constants.OFFSET.SPOT_LIGHT.POSITION, new Float32Array(this.loc));
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, arrStart + stride*this.index + Constants.OFFSET.SPOT_LIGHT.DIRECTION, new Float32Array(this.direction));
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, arrStart + stride*this.index + Constants.OFFSET.SPOT_LIGHT.CUTOFF, new Float32Array([this.cutoff]));
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, arrStart + stride*this.index + Constants.OFFSET.SPOT_LIGHT.COLOR, new Float32Array(this.color));
    }
}

class LightSystem
{
    static LightType = Object.freeze({
        DIRECTIONAL: 0,
        POINT: 1,
        SPOT: 2,
    });

    constructor(ambient) {
        this.pointLights = [];
        this.directionalLights = [];
        this.spotLights = [];
        this.ambientLight = ambient;
        this.maxDirLights = Constants.MAX_LIGHT_NUM.DIRECTIONAL;
        this.maxPointLights = Constants.MAX_LIGHT_NUM.POINT;
        this.maxSpotLights = Constants.MAX_LIGHT_NUM.SPOT;

        this.lightUniformBuffer = gpu.global_lightBuffer;

        gpu.device.queue.writeBuffer(this.lightUniformBuffer, 0, new Uint8Array(Constants.SIZE.LIGHT_UNIFORM)); // zero buffer
    }

    addPointLight(loc, col) {
        if (this.pointLights.length >= this.maxPointLights) return undefined;
        var light = new PointLight(loc, col, this.pointLights.length);
        this.pointLights.push(light);
        return light;
    }

    getPointLight(index) {
        return this.pointLights[index];
    }

    addDirLight(dir, col) {
        if (this.directionalLights.length >= this.maxDirLights) return undefined;
        var light = new DirectionalLight(dir, col, this.directionalLights.length);
        this.directionalLights.push(light);
        return light;
    }

    getDirLight(index) {
        return this.directionalLights[index];
    }

    addSpotLight(loc, dir, col, cut) {
        if (this.spotLights.length >= this.maxSpotLights) return undefined;
        var light = new SpotLight(loc, dir, col, cut, this.spotLights.length);
        this.spotLights.push(light);
        return light;
    }

    getSpotLight(index) {
        return this.spotLights[index];
    }

    // Meant to allow for subclassing the three light types.
    // Useful for making two light types that update() differently.
    addLight(type, prefab, ...args) {
        // This one isn't dark sorcery; it's "light" sorcery :P
        var light = new prefab(...args);
        switch (type) {
            case LightSystem.LightType.DIRECTIONAL:
                if (this.directionalLights.length >= this.maxDirLights) return undefined;
                light.index = this.directionalLights.length;
                this.directionalLights.push(light);
                break;
            case LightSystem.LightType.POINT:
                if (this.pointLights.length >= this.maxPointLights) return undefined;
                light.index = this.pointLights.length;
                this.pointLights.push(light);
                break;
            case LightSystem.LightType.SPOT:
                if (this.spotLights.length >= this.maxSpotLights) return undefined;
                light.index = this.spotLights.length;
                this.spotLights.push(light);
                break;
            default:
                break;
        }
        return light;
    }

    setBindGroups(commandPass) {
        commandPass.setBindGroup(0, gpu.global_renderBindGroup0);
        commandPass.setBindGroup(1, gpu.global_renderBindGroup1);
        commandPass.setBindGroup(2, gpu.global_renderBindGroup2);
    }

    update() {
        this.pointLights.forEach(light => light.update());
        this.directionalLights.forEach(light => light.update());
        this.spotLights.forEach(light => light.update());
    }

    render(commandPass) {
        this.setBindGroups(commandPass);

        gpu.device.queue.writeBuffer(this.lightUniformBuffer, Constants.OFFSET.LIGHT_UNIFORM.NUM_DIR_LIGHTS, new Uint32Array([this.directionalLights.length])); // set numDirLights
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, Constants.OFFSET.LIGHT_UNIFORM.NUM_POINT_LIGHTS, new Uint32Array([this.pointLights.length])); // set numPointLights
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, Constants.OFFSET.LIGHT_UNIFORM.NUM_SPOT_LIGHTS, new Uint32Array([this.spotLights.length])); // set numSpotLights
        gpu.device.queue.writeBuffer(this.lightUniformBuffer, Constants.OFFSET.LIGHT_UNIFORM.AMBIENT_LIGHT, new Float32Array(this.ambientLight));
        this.pointLights.forEach(light => light.render(commandPass));
        this.directionalLights.forEach(light => light.render(commandPass));
        this.spotLights.forEach(light => light.render(commandPass));
    }
}


class Orrery
{
    static numPlanets = 0;
    static rng = new Srandom(4257);

    static addPlanet(objects, parentId, type) {
        let pnum = ++Orrery.numPlanets;
        if (parentId === undefined) {
            let pol = [5 + pnum * 10, 2*Math.PI * Orrery.rng.next(), 0];
            let rot = objects[0].offset.rot;
            let scl = objects[0].offset.scl;
            let rotSpeed = [0, -0.0075 / pnum, 0];
            let polSpeed = 0.0005 + 0.004 / pnum;
            let incline = (pnum % 6 === 0) ? Math.PI/8 : Math.PI/24 * Orrery.rng.next();
            let offset = 2*Math.PI * Orrery.rng.next();
            let axisMode = undefined;
            objects.forEach(object => {
                // pol, rot, scl, object, rotSpeed, polSpeed, incline, offset, axisMode
                gpu.createParentedObject(
                    parentId, type, DrawableWavefrontPlanet, pol, rot, scl, object,
                    rotSpeed, polSpeed, incline, offset, axisMode
                );
            });
        } else {
            let pol = [5, 2*Math.PI * Orrery.rng.next(), 0];
            let rot = objects[0].offset.rot;
            let scl = objects[0].offset.scl;
            let rotSpeed = [0, -0.0075, 0];
            let polSpeed = 0.0005 + 0.004 * Orrery.rng.next();
            let incline = Math.PI/8 * Orrery.rng.next();
            let offset = 2*Math.PI * Orrery.rng.next();
            let axisMode = Math.floor(3 * Orrery.rng.next());
            objects.forEach(object => {
                // pol, rot, scl, object, rotSpeed, polSpeed, incline, offset, axisMode
                gpu.createParentedObject(
                    parentId, type, DrawableWavefrontPlanet, pol, rot, scl, object,
                    rotSpeed, polSpeed, incline, offset, axisMode
                );
            });
        }
    }
}


class DrawableWavefrontObject extends GameObject
{
    constructor(loc, rot, scl, object) {
        // Spread operator ensures arrays are copied
        super([...loc], [...rot], [...scl]);

        this.wavefrontObject = object;
        this.ambientOverride = false;
        this.name = this.wavefrontObject.name;
        let texData = this.wavefrontObject.textureData;
        let texMode = texData.textureMode;

        this.objectUniformBufferSize = Constants.SIZE.OBJECT_UNIFORM;
        this.objectUniformBuffer = gpu.device.createBuffer({
            label: "Local DrawableWavefrontObject buffer for " + this.id,
            size: this.objectUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        if (this.wavefrontObject.hasTextures) {
            // Create and write to appropriate textures based on mode flags
            if (texMode & WebGpu.TextureMode.AMBIENT) {
                this.ambientTexture = gpu.device.createTexture({
                    label: 'Ambient texture for ' + this.wavefrontObject.name,
                    size: [texData.ambientTexture.width, texData.ambientTexture.height],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                });
                gpu.device.queue.copyExternalImageToTexture(
                    { source: texData.ambientTexture },
                    { texture: this.ambientTexture },
                    [texData.ambientTexture.width, texData.ambientTexture.height],
                );
            }
            if (texMode & WebGpu.TextureMode.DIFFUSE) {
                this.diffuseTexture = gpu.device.createTexture({
                    label: 'Diffuse texture for ' + this.wavefrontObject.name,
                    size: [texData.diffuseTexture.width, texData.diffuseTexture.height],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                });
                gpu.device.queue.copyExternalImageToTexture(
                    { source: texData.diffuseTexture },
                    { texture: this.diffuseTexture },
                    [texData.diffuseTexture.width, texData.diffuseTexture.height],
                );
            }
            if (texMode & WebGpu.TextureMode.SPECULAR) {
                this.specularTexture = gpu.device.createTexture({
                    label: 'Specular texture for ' + this.wavefrontObject.name,
                    size: [texData.specularTexture.width, texData.specularTexture.height],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                });
                gpu.device.queue.copyExternalImageToTexture(
                    { source: texData.specularTexture },
                    { texture: this.specularTexture },
                    [texData.specularTexture.width, texData.specularTexture.height],
                );
            }
            if (texMode & WebGpu.TextureMode.NORMAL) {
                this.normalTexture = gpu.device.createTexture({
                    label: 'Normal texture for ' + this.wavefrontObject.name,
                    size: [texData.normalTexture.width, texData.normalTexture.height],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                });
                gpu.device.queue.copyExternalImageToTexture(
                    { source: texData.normalTexture },
                    { texture: this.normalTexture },
                    [texData.normalTexture.width, texData.normalTexture.height],
                );
            }

            // Set default textures depending on texture mode flags
            if ((texMode & WebGpu.TextureMode.DIFFUSE) && !(texMode & WebGpu.TextureMode.AMBIENT)) {
                this.ambientTexture = this.diffuseTexture;
                this.ambientOverride = true;
            }
        }

        this.renderBG0 = gpu.device.createBindGroup({
            label: "Local DrawableWavefrontObject render pipeline object bind group",
            layout: gpu.renderPipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.objectUniformBuffer },
            }, {
                binding: 1,
                resource: (texData.sampler === undefined) ? gpu.objectSampler : gpu[texData.sampler],
            }, {
                binding: 2,
                resource: (texMode & WebGpu.TextureMode.AMBIENT || this.ambientOverride) ? this.ambientTexture.createView() : gpu.dummy_textureView,
            }, {
                binding: 3,
                resource: (texMode & WebGpu.TextureMode.DIFFUSE) ? this.diffuseTexture.createView() : gpu.dummy_textureView,
            }, {
                binding: 4,
                resource: (texMode & WebGpu.TextureMode.SPECULAR) ? this.specularTexture.createView() : gpu.dummy_textureView,
            }, {
                binding: 5,
                resource: (texMode & WebGpu.TextureMode.NORMAL) ? this.normalTexture.createView() : gpu.dummy_textureView,
            }],
        });

        // Size of buffer is: faces * 3 vertices/face * (pos(vec3f) + normal(vec3f) + uvs(vec2f))
        this.vertices = new Float32Array(this.wavefrontObject.faces.length*3*(3+3+2));
        this.buildObjectVerticies();
        this.vertexBuffer = gpu.device.createBuffer({
            label: "Local vertex buffer for " + this.id,
            size: this.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        gpu.device.queue.writeBuffer(this.vertexBuffer, /*bufferOffset=*/0, this.vertices);
    }

    buildObjectVerticies() {
        var idx = 0;
        for (var face of this.wavefrontObject.faces) {
            for (var vtx of face) {
                var vIdx = vtx[0]-1, vtIdx = vtx[1]-1, vnIdx = vtx[2]-1;
                var vertex = [
                    ...this.wavefrontObject.vertices[vIdx],
                    ...this.wavefrontObject.normals[vnIdx],
                    ...this.wavefrontObject.coorduvs[vtIdx],
                ];
                // Float32Array has no vector-like methods
                for (var value of vertex) {
                    this.vertices[idx] = value;
                    idx++;
                }
            }
        }
    }

    setBindGroups(commandPass) {
        commandPass.setBindGroup(0, this.renderBG0);
    }

    update() {}

    render(commandPass, offset) {
        // Render self
        var materialStart = Constants.OFFSET.OBJECT_UNIFORM.MATERIAL;
        var mWorldOffsetT = math.transpose(offset);
        var overrides = 0 | this.ambientOverride ? (WebGpu.TextureMode.AMBIENT) : 0;
        this.setBindGroups(commandPass);

        gpu.device.queue.writeBuffer(this.objectUniformBuffer, Constants.OFFSET.OBJECT_UNIFORM.TRANSFORM, new Float32Array(math.flatten(mWorldOffsetT)._data));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, materialStart + Constants.OFFSET.MATERIAL.K_AMBIENT, new Float32Array(this.wavefrontObject.material.kAmbient));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, materialStart + Constants.OFFSET.MATERIAL.K_DIFFUSE, new Float32Array(this.wavefrontObject.material.kDiffuse));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, materialStart + Constants.OFFSET.MATERIAL.K_SPECULAR, new Float32Array(this.wavefrontObject.material.kSpecular));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, materialStart + Constants.OFFSET.MATERIAL.SHINE, new Float32Array([this.wavefrontObject.material.nSpecular]));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, Constants.OFFSET.OBJECT_UNIFORM.TEXTURE_MODE, new Uint32Array([this.wavefrontObject.textureData.textureMode | overrides]));

        commandPass.setVertexBuffer(0, this.vertexBuffer);
        commandPass.draw(this.vertices.length/(3+3+2)); /* vertexnum/sizeof(params) */
    }
}


class DrawableWavefrontPlanet extends PlanetBase
{
    constructor(pol, rot, scl, object, ...args) {
        // Spread operator ensures arrays are copied
        super([...pol], [...rot], [...scl], ...args);

        this.wavefrontObject = object;
        this.ambientOverride = false;
        this.name = this.wavefrontObject.name;
        let texData = this.wavefrontObject.textureData;
        let texMode = texData.textureMode;

        this.objectUniformBufferSize = Constants.SIZE.OBJECT_UNIFORM;
        this.objectUniformBuffer = gpu.device.createBuffer({
            label: "Local DrawableWavefrontObject buffer for " + this.id,
            size: this.objectUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        if (this.wavefrontObject.hasTextures) {
            // Create and write to appropriate textures based on mode flags
            if (texMode & WebGpu.TextureMode.AMBIENT) {
                this.ambientTexture = gpu.device.createTexture({
                    label: 'Ambient texture for ' + this.wavefrontObject.name,
                    size: [texData.ambientTexture.width, texData.ambientTexture.height],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                });
                gpu.device.queue.copyExternalImageToTexture(
                    { source: texData.ambientTexture },
                    { texture: this.ambientTexture },
                    [texData.ambientTexture.width, texData.ambientTexture.height],
                );
            }
            if (texMode & WebGpu.TextureMode.DIFFUSE) {
                this.diffuseTexture = gpu.device.createTexture({
                    label: 'Diffuse texture for ' + this.wavefrontObject.name,
                    size: [texData.diffuseTexture.width, texData.diffuseTexture.height],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                });
                gpu.device.queue.copyExternalImageToTexture(
                    { source: texData.diffuseTexture },
                    { texture: this.diffuseTexture },
                    [texData.diffuseTexture.width, texData.diffuseTexture.height],
                );
            }
            if (texMode & WebGpu.TextureMode.SPECULAR) {
                this.specularTexture = gpu.device.createTexture({
                    label: 'Specular texture for ' + this.wavefrontObject.name,
                    size: [texData.specularTexture.width, texData.specularTexture.height],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                });
                gpu.device.queue.copyExternalImageToTexture(
                    { source: texData.specularTexture },
                    { texture: this.specularTexture },
                    [texData.specularTexture.width, texData.specularTexture.height],
                );
            }
            if (texMode & WebGpu.TextureMode.NORMAL) {
                this.normalTexture = gpu.device.createTexture({
                    label: 'Normal texture for ' + this.wavefrontObject.name,
                    size: [texData.normalTexture.width, texData.normalTexture.height],
                    format: 'rgba8unorm',
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
                });
                gpu.device.queue.copyExternalImageToTexture(
                    { source: texData.normalTexture },
                    { texture: this.normalTexture },
                    [texData.normalTexture.width, texData.normalTexture.height],
                );
            }

            // Set default textures depending on texture mode flags
            if ((texMode & WebGpu.TextureMode.DIFFUSE) && !(texMode & WebGpu.TextureMode.AMBIENT)) {
                this.ambientTexture = this.diffuseTexture;
                this.ambientOverride = true;
            }
        }

        this.renderBG0 = gpu.device.createBindGroup({
            label: "Local DrawableWavefrontObject render pipeline object bind group",
            layout: gpu.renderPipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.objectUniformBuffer },
            }, {
                binding: 1,
                resource: (texData.sampler === undefined) ? gpu.objectSampler : gpu[texData.sampler],
            }, {
                binding: 2,
                resource: (texMode & WebGpu.TextureMode.AMBIENT || this.ambientOverride) ? this.ambientTexture.createView() : gpu.dummy_textureView,
            }, {
                binding: 3,
                resource: (texMode & WebGpu.TextureMode.DIFFUSE) ? this.diffuseTexture.createView() : gpu.dummy_textureView,
            }, {
                binding: 4,
                resource: (texMode & WebGpu.TextureMode.SPECULAR) ? this.specularTexture.createView() : gpu.dummy_textureView,
            }, {
                binding: 5,
                resource: (texMode & WebGpu.TextureMode.NORMAL) ? this.normalTexture.createView() : gpu.dummy_textureView,
            }],
        });

        // Size of buffer is: faces * 3 vertices/face * (pos(vec3f) + normal(vec3f) + uvs(vec2f))
        this.vertices = new Float32Array(this.wavefrontObject.faces.length*3*(3+3+2));
        this.buildObjectVerticies();
        this.vertexBuffer = gpu.device.createBuffer({
            label: "Local vertex buffer for " + this.id,
            size: this.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        gpu.device.queue.writeBuffer(this.vertexBuffer, /*bufferOffset=*/0, this.vertices);
    }

    buildObjectVerticies() {
        var idx = 0;
        for (var face of this.wavefrontObject.faces) {
            for (var vtx of face) {
                var vIdx = vtx[0]-1, vtIdx = vtx[1]-1, vnIdx = vtx[2]-1;
                var vertex = [
                    ...this.wavefrontObject.vertices[vIdx],
                    ...this.wavefrontObject.normals[vnIdx],
                    ...this.wavefrontObject.coorduvs[vtIdx],
                ];
                // Float32Array has no vector-like methods
                for (var value of vertex) {
                    this.vertices[idx] = value;
                    idx++;
                }
            }
        }
    }

    setBindGroups(commandPass) {
        commandPass.setBindGroup(0, this.renderBG0);
    }

    render(commandPass, offset) {
        // Render self
        var materialStart = Constants.OFFSET.OBJECT_UNIFORM.MATERIAL;
        var mWorldOffsetT = math.transpose(offset);
        var overrides = 0 | this.ambientOverride ? (WebGpu.TextureMode.AMBIENT) : 0;
        this.setBindGroups(commandPass);

        gpu.device.queue.writeBuffer(this.objectUniformBuffer, Constants.OFFSET.OBJECT_UNIFORM.TRANSFORM, new Float32Array(math.flatten(mWorldOffsetT)._data));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, materialStart + Constants.OFFSET.MATERIAL.K_AMBIENT, new Float32Array(this.wavefrontObject.material.kAmbient));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, materialStart + Constants.OFFSET.MATERIAL.K_DIFFUSE, new Float32Array(this.wavefrontObject.material.kDiffuse));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, materialStart + Constants.OFFSET.MATERIAL.K_SPECULAR, new Float32Array(this.wavefrontObject.material.kSpecular));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, materialStart + Constants.OFFSET.MATERIAL.SHINE, new Float32Array([this.wavefrontObject.material.nSpecular]));
        gpu.device.queue.writeBuffer(this.objectUniformBuffer, Constants.OFFSET.OBJECT_UNIFORM.TEXTURE_MODE, new Uint32Array([this.wavefrontObject.textureData.textureMode | overrides]));

        commandPass.setVertexBuffer(0, this.vertexBuffer);
        commandPass.draw(this.vertices.length/(3+3+2)); /* vertexnum/sizeof(params) */
    }
}


class BlackHole extends GameObject
{
    constructor(loc, radius, horizon, halo, push, warp, bend) {
        // Spread operator ensures arrays are copied
        super([...loc], [0,0,0], [1,1,1]);

        this.effectRadius = radius;
        this.horizonRadius = horizon;
        this.haloFalloff = halo;
        this.pushStrength = push;
        this.warpStrength = warp;
        this.bendStrength = bend;

        this.singularityUniformBufferSize = Constants.SIZE.SINGULARITY_UNIFORM;
        this.singularityUniformBuffer = gpu.device.createBuffer({
            label: "Local BlackHole singularity buffer for " + this.id,
            size: this.singularityUniformBufferSize,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.singularityBG0 = gpu.device.createBindGroup({
            label: "Local BlackHole singularity pipeline singularity bind group",
            layout: gpu.singularityPipeline.getBindGroupLayout(0),
            entries: [{
                binding: 0,
                resource: { buffer: this.singularityUniformBuffer },
            }, {
                binding: 1,
                resource: gpu.genericSampler,
            }, {
                binding: 2,
                resource: gpu.comparisonSampler,
            }, {
                binding: 3,
                resource: gpu.renderPassTextureView,
            }, {
                binding: 4,
                resource: gpu.renderPassDepthTextureView,
            }],
        });

        // Full screen quad
        this.vertices = new Float32Array([
        //   X  Y  Z  nX nY nZ   U V
            -1,-1, 0,  0, 0, 1,  0,0,
             1,-1, 0,  0, 0, 1,  0,0,
            -1, 1, 0,  0, 0, 1,  0,0,
            -1, 1, 0,  0, 0, 1,  0,0,
             1,-1, 0,  0, 0, 1,  0,0,
             1, 1, 0,  0, 0, 1,  0,0,
        ]);
        this.vertexBuffer = gpu.device.createBuffer({
            label: "Local BlackHole vertex buffer for " + this.id,
            size: this.vertices.byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        gpu.device.queue.writeBuffer(this.vertexBuffer, /*bufferOffset=*/0, this.vertices);
    }

    setBindGroups(commandPass) {
        commandPass.setBindGroup(0, this.singularityBG0);
    }

    update() {}

    render(commandPass, offset) {
        // Render self
        this.setBindGroups(commandPass);

        gpu.device.queue.writeBuffer(this.singularityUniformBuffer, Constants.OFFSET.SINGULARITY_UNIFORM.CENTER, new Float32Array(this.loc));
        gpu.device.queue.writeBuffer(this.singularityUniformBuffer, Constants.OFFSET.SINGULARITY_UNIFORM.EFFECT_RADIUS, new Float32Array([this.effectRadius]));
        gpu.device.queue.writeBuffer(this.singularityUniformBuffer, Constants.OFFSET.SINGULARITY_UNIFORM.HORIZON_RADIUS, new Float32Array([this.horizonRadius]));
        gpu.device.queue.writeBuffer(this.singularityUniformBuffer, Constants.OFFSET.SINGULARITY_UNIFORM.HALO_FALLOFF, new Float32Array([this.haloFalloff]));
        gpu.device.queue.writeBuffer(this.singularityUniformBuffer, Constants.OFFSET.SINGULARITY_UNIFORM.PUSH_STRENGTH, new Float32Array([this.pushStrength]));
        gpu.device.queue.writeBuffer(this.singularityUniformBuffer, Constants.OFFSET.SINGULARITY_UNIFORM.WARP_STRENGTH, new Float32Array([this.warpStrength]));
        gpu.device.queue.writeBuffer(this.singularityUniformBuffer, Constants.OFFSET.SINGULARITY_UNIFORM.BEND_STRENGTH, new Float32Array([this.bendStrength]));

        commandPass.setVertexBuffer(0, this.vertexBuffer);
        commandPass.draw(this.vertices.length/(3+3+2)); /* vertexnum/sizeof(params) */
    }
}