class Transform {
    constructor() {
        
        this.mat = Transform.identity();
    }

    static identity() {
        const m = new Float32Array(16);
        m[0]=1; m[5]=1; m[10]=1; m[15]=1;
        return m;
    }

    
    static multiply(A, B) {
        const out = new Float32Array(16);
        for (let r = 0; r < 4; ++r) {
            for (let c = 0; c < 4; ++c) {
                let s = 0.0;
                for (let k = 0; k < 4; ++k) {
                    s += A[k*4 + r] * B[c*4 + k];
                }
                out[c*4 + r] = s;
            }
        }
        return out;
    }

    static fromTranslation(tx, ty, tz) {
        const m = Transform.identity();
        m[12] = tx; m[13] = ty; m[14] = tz;
        return m;
    }


    static fromScale(sx, sy, sz) {
        const m = new Float32Array(16);
        m[0]=sx; m[5]=sy; m[10]=sz; m[15]=1;
        return m;
    }


    static fromEuler(rx, ry, rz) {
        const cx=Math.cos(rx), sx=Math.sin(rx);
        const cy=Math.cos(ry), sy=Math.sin(ry);
        const cz=Math.cos(rz), sz=Math.sin(rz);

        // Rx * Ry * Rz (row/col orientation chosen so multiply works with multiply function)
        const Rx = new Float32Array([
            1,0,0,0,
            0,cx,sx,0,
            0,-sx,cx,0,
            0,0,0,1
        ]);
        const Ry = new Float32Array([
            cy,0,-sy,0,
            0,1,0,0,
            sy,0,cy,0,
            0,0,0,1
        ]);
        const Rz = new Float32Array([
            cz,sz,0,0,
            -sz,cz,0,0,
            0,0,1,0,
            0,0,0,1
        ]);

       
        return Transform.multiply(Rz, Transform.multiply(Ry, Rx));
    }

   
    setTRS(position = [0,0,0], rotation = [0,0,0], scale = [1,1,1]) {
        const T = Transform.fromTranslation(position[0], position[1], position[2]);
        const R = Transform.fromEuler(rotation[0], rotation[1], rotation[2]);
        const S = Transform.fromScale(scale[0], scale[1], scale[2]);
        // M = T * R * S
        this.mat = Transform.multiply(T, Transform.multiply(R, S));
    }

   
    transformVec4(v) {
        const m = this.mat;
        return [
            m[0]*v[0] + m[4]*v[1] + m[8]*v[2]  + m[12]*v[3],
            m[1]*v[0] + m[5]*v[1] + m[9]*v[2]  + m[13]*v[3],
            m[2]*v[0] + m[6]*v[1] + m[10]*v[2] + m[14]*v[3],
            m[3]*v[0] + m[7]*v[1] + m[11]*v[2] + m[15]*v[3]
        ];
    }

   
    getForward() { return [this.mat[8], this.mat[9], this.mat[10]]; }  // +Z in object space
    getRight()   { return [this.mat[0], this.mat[1], this.mat[2]]; }   // +X
    getUp()      { return [this.mat[4], this.mat[5], this.mat[6]]; }   // +Y
}

class DiffuseTextureLoad {
    static async loadTexture(filePath) {
        const img = new Image();
        img.src = filePath;
        await img.decode();

        const bitmap = await createImageBitmap(img);

        const texture = m.GPU.device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING |
                   GPUTextureUsage.COPY_DST |
                   GPUTextureUsage.RENDER_ATTACHMENT,
        });

        m.GPU.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture: texture },
            [bitmap.width, bitmap.height]
        );

        return texture;
    }
}

class TextureLoad {
    static async loadTexture(filePath) {
        
        const img = new Image();
        img.src = filePath;
        await img.decode();

       
        const bitmap = await createImageBitmap(img);

       
        const texture = m.GPU.device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING |
                   GPUTextureUsage.COPY_DST |
                   GPUTextureUsage.RENDER_ATTACHMENT,
        });

    
        m.GPU.device.queue.copyExternalImageToTexture(
            { source: bitmap },
            { texture: texture },
            [bitmap.width, bitmap.height]
        );

        return texture;
    }
}


class ColorLoad 
            {
                constructor()
                {
                    this.lines = {};
                    this.materials={}
                    this.current=null;

                }
                async load(filePath)
                {
                    this.file = await fetch(filePath);
                    this.text = await this.file.text();
                    return this.parse(this.text);
                }
                parse(file)
                {
                    this.lines = file.split("\n");
                    for (let l of this.lines)
                    {
                        const trimmedLines = l.trim();//remove white space
                        if(!trimmedLines || trimmedLines.startsWith('#'))
                        {
                            continue;
                        }
                        const [startChar, ...data] = trimmedLines.split(" ");
                        switch (startChar) 
                        {
                        case 'newmtl':
                            this.current = data[0];
                            this.materials[this.current] = {Kd:[1,1,1]};
                            break;
                        case 'Kd': 
                            if (this.current) this.materials[this.current].Kd = data.map(parseFloat);
                            break;
                        case 'Ka':


                        }
                    }
                return this.materials;
            }
            }
class OBJLoad {
    constructor(file) {
        this.lines = file.split('\n');
        this.positions = [];
        this.normals = [];
        this.uvs = [];
        this.faces = [];
        this.faceMat = [];
        this.currentMat = [1, 1, 1]; 
        this.finalPos = [];
        this.finalNormals = [];
        this.finalUVs = [];  // NEW: store final UVs
        this.finalCol = [];
        this.finalInd = [];
        this.finalTangents = [];
    }

    parse(materials = {}) {
        for (const line of this.lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const [startChar, ...data] = trimmed.split(/\s+/);
            switch (startChar) {
                case 'v': this.positions.push(data.map(parseFloat)); break;
                case 'vn': this.normals.push(data.map(parseFloat)); break;
                case 'vt': this.uvs.push(data.map(parseFloat)); break; // track UVs
                case 'f': this.faces.push(data); this.faceMat.push(this.currentMat); break;
                case 'usemtl': if (materials[data[0]]) this.currentMat = materials[data[0]].Kd; break;
            }
        }

        const cache = {};
        let i = 0;
        for (let f = 0; f < this.faces.length; f++) {
            const face = this.faces[f];
            const color = this.faceMat[f];

            for (let j = 1; j < face.length - 1; j++) {
                const tri = [face[0], face[j], face[j + 1]];
                const idx = tri.map(s => s.split('/').map(n => Number(n) - 1));

                const pos0 = this.positions[idx[0][0]];
                const pos1 = this.positions[idx[1][0]];
                const pos2 = this.positions[idx[2][0]];

                const uv0 = this.uvs[idx[0][1]] || [0,0];
                const uv1 = this.uvs[idx[1][1]] || [0,0];
                const uv2 = this.uvs[idx[2][1]] || [0,0];

                const edge1 = pos1.map((v, k) => v - pos0[k]);
                const edge2 = pos2.map((v, k) => v - pos0[k]);
                const deltaUV1 = [uv1[0]-uv0[0], uv1[1]-uv0[1]];
                const deltaUV2 = [uv2[0]-uv0[0], uv2[1]-uv0[1]];
                const fTan = 1.0 / (deltaUV1[0]*deltaUV2[1] - deltaUV2[0]*deltaUV1[1]);

                const tx = fTan * (deltaUV2[1]*edge1[0] - deltaUV1[1]*edge2[0]);
                const ty = fTan * (deltaUV2[1]*edge1[1] - deltaUV1[1]*edge2[1]);
                const tz = fTan * (deltaUV2[1]*edge1[2] - deltaUV1[1]*edge2[2]);
                const tangent = [tx, ty, tz];

                const n = this.normals[idx[0][2]] || [0,0,1];
                const cross = [
                    n[1]*tangent[2] - n[2]*tangent[1],
                    n[2]*tangent[0] - n[0]*tangent[2],
                    n[0]*tangent[1] - n[1]*tangent[0]
                ];
                const dot = cross[0]*(edge1[0]) + cross[1]*(edge1[1]) + cross[2]*(edge1[2]);
                const w = (dot < 0.0) ? -1.0 : 1.0;

                for (let k = 0; k < 3; k++) {
                    const [vI,,nI,uI] = idx[k];
                    const faceStr = tri[k];
                    if (cache[faceStr] !== undefined) {
                        this.finalInd.push(cache[faceStr]);
                        continue;
                    }
                    cache[faceStr] = i;
                    this.finalInd.push(i);

                    if (vI >= 0 && this.positions[vI]) this.finalPos.push(...this.positions[vI]);
                    if (nI >= 0 && this.normals[nI]) this.finalNormals.push(...this.normals[nI]);
                    this.finalTangents.push(...tangent, w);
                    this.finalCol.push(...color, 1.0);

                    // Add UV coordinates for diffuse mapping
                    if (idx[k][1] >= 0 && this.uvs[idx[k][1]]) this.finalUVs.push(...this.uvs[idx[k][1]]);
                    else this.finalUVs.push(0,0);

                    i++;
                }
            }
        }

        return {
            positions: new Float32Array(this.finalPos),
            normals: new Float32Array(this.finalNormals),
            tangents: new Float32Array(this.finalTangents),
            colors: new Float32Array(this.finalCol),
            uvs: new Float32Array(this.finalUVs),  
            indices: new Uint16Array(this.finalInd),
        };
    }
}


class BasicShape {
    constructor(obj, position, rotation, scale, materials, normalMapTexture, diffuseTexture) {
        this.transform = new Transform();
        this.transform.setTRS(position, rotation, scale);

        this.materials = materials;
        this.normalMap = normalMapTexture; 
        this.diffuseTexture = diffuseTexture; 
        this.diffuseTextureView = this.diffuseTexture.createView();
        this.diffuseSampler = m.GPU.repeatSampler;

        this.vertexCount = obj.indices.length;
        this.vertices = [];
       


        for (let i = 0; i < obj.positions.length / 3; i++) {
            let r = obj.colors[i * 4] || 1.0;
            let g = obj.colors[i * 4 + 1] || 1.0;
            let b = obj.colors[i * 4 + 2] || 1.0;
            let nx = obj.normals[i * 3] || 0.0;
            let ny = obj.normals[i * 3 + 1] || 0.0;
            let nz = obj.normals[i * 3 + 2] || 1.0;
            let tx = obj.tangents[i * 4] || 1.0;
            let ty = obj.tangents[i * 4 + 1] || 0.0;
            let tz = obj.tangents[i * 4 + 2] || 0.0;
            let tw = obj.tangents[i * 4 + 3] || 1.0;

            
            let u = obj.uvs ? obj.uvs[i*2] || 0.0 : 0.0;
            let v = obj.uvs ? obj.uvs[i*2+1] || 0.0 : 0.0;

            this.vertices.push(
                obj.positions[i*3], obj.positions[i*3+1], obj.positions[i*3+2], 
                r, g, b, 
                nx, ny, nz, 
                tx, ty, tz, tw,
                u, v
            );
        }
        



        // Create sampler (shared)
        m.GPU.repeatSampler = m.GPU.device.createSampler({
            magFilter: 'linear',   
            minFilter: 'linear',   
            mipmapFilter: 'linear', 
            addressModeU: 'repeat', 
            addressModeV: 'repeat', 
            addressModeW: 'repeat', 
        });

        // Vertex buffer
        this.vertexBuffer = m.GPU.device.createBuffer({
            label: "basic shape vertices",
            size: new Float32Array(this.vertices).byteLength,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        m.GPU.device.queue.writeBuffer(this.vertexBuffer, 0, new Float32Array(this.vertices));

        // Index buffer
        this.indexBuffer = m.GPU.device.createBuffer({
            label: "OBJ Index Buffer",
            size: obj.indices.byteLength,
            usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        });
        m.GPU.device.queue.writeBuffer(this.indexBuffer, 0, obj.indices);

        // Uniform buffer
        const OBJECT_UNIFORM_SIZE = 64;
        this.uniformBuffer = m.GPU.device.createBuffer({
            label: "model uniform",
            size: OBJECT_UNIFORM_SIZE,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Bind group now includes diffuse texture
          this.bindGroup = m.GPU.device.createBindGroup({
            layout: m.GPU.objectBindLayout, 
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: this.normalMap },        // normal map
                { binding: 2, resource: m.GPU.repeatSampler },   // sampler
                { binding: 3, resource: this.diffuseTextureView }       // diffuse texture
            ]
        });

        this.uploadTransform();
        console.log("firet shape");
    }

    uploadTransform() {
        m.GPU.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array(this.transform.mat));
    }

    Render(pass) {
        this.uploadTransform();
        pass.setBindGroup(0, this.bindGroup);
        pass.setVertexBuffer(0, this.vertexBuffer);
        pass.setIndexBuffer(this.indexBuffer, "uint16");
        pass.drawIndexed(this.vertexCount);
    }
}



class Light
            {
                constructor()
                {
                    this.pos = [0,0,0,1];
                    this.rot = [0,0,1,0];
                    this.isTrigger = false;
                    this.collissionRadius = 1.0;
                    this.velocity = [0,0,0];
                    this.angVelocity = [0,0,0];
                    this.name = "default";
                    this.id = 0;
                    this.prefab;
                    this.transform = new Transform();
                }
               
                Update()
                {
                    console.error(this.name +" update() is NOT IMPLEMENTED!");
                }
                Render(commandPass)
                {
                    console.error(this.name + " render() is NOT IMPLEMENTED!");
                }	
                
                OnTriggerHit(other)
                {
                    
                }
                
                OnPhysicalHit(other)
                {
                    
                }

                            
            }



class PointLight extends Light {
    constructor(position, color)
     {
        super();
        this.position = position;
        this.color = color;
        this.lightIndex = m.currentPointLight;
        m.currentPointLight++;
        this.ambientLight = 1;
        const numPointBuffer = new Uint32Array([m.currentPointLight]);
        m.GPU.device.queue.writeBuffer(m.GPU.lightBuffer, 0, numPointBuffer);
        this.pLightGroup = m.GPU.device.createBindGroup({
            label: "PointLight",
            layout: m.GPU.LightBindLayout,
            entries: [
                { binding: 0, resource: { buffer: m.GPU.lightBuffer } } 
            ]
        });
    }

    Render(commandPass) {
        commandPass.setBindGroup(2, this.pLightGroup);
        const offset = 16 + this.lightIndex * 32;
        m.GPU.device.queue.writeBuffer(m.GPU.lightBuffer, offset, new Float32Array(this.position));
        m.GPU.device.queue.writeBuffer(m.GPU.lightBuffer, offset + 16, new Float32Array(this.color));
    }
}


