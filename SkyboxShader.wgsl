// SkyboxShader.wgsl

struct CameraData {
    view : mat4x4<f32>,
    proj : mat4x4<f32>,
};
@group(1) @binding(0)
var<uniform> camera : CameraData;

@group(0) @binding(0) var skyTex : texture_2d_array<f32>;
@group(0) @binding(1) var skySampler : sampler;

struct VertexOutput {
    @builtin(position) position : vec4<f32>,
    @location(0) dir : vec3<f32>,
};

@vertex
fn vertexMain(@location(0) position: vec3<f32>) -> VertexOutput {
    var out : VertexOutput;

    // Remove translation — rebuild row 3
    var viewNoTrans = camera.view;
    viewNoTrans[3] = vec4<f32>(0.0, 0.0, 0.0, viewNoTrans[3].w);

    // Compute view-projection
    let viewProj = camera.proj * viewNoTrans;

    out.position = camera.proj * camera.view * vec4(position, 1.0);


    // Push skybox to far plane
    out.position = vec4(out.position.xy, out.position.w, out.position.w);

    // Direction for sampling the cubemap
    out.dir = position;

    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    let absDir = abs(in.dir);
    var layer: i32 = 0;
    var uv: vec2<f32>;

    if (absDir.x > absDir.y && absDir.x > absDir.z) {
        if (in.dir.x > 0.0) {
            layer = 0;
        } else {
            layer = 1;
        }
        uv = vec2(in.dir.z, in.dir.y) / absDir.x;
    } else if (absDir.y > absDir.z) {
        if (in.dir.y > 0.0) {
            layer = 2;
        } else {
            layer = 3;
        }
        uv = vec2(in.dir.x, in.dir.z) / absDir.y;
    } else {
        if (in.dir.z > 0.0) {
            layer = 4;
        } else {
            layer = 5;
        }
        uv = vec2(in.dir.x, in.dir.y) / absDir.z;
    }

    uv = uv * 0.5 + vec2(0.5, 0.5); // map from [-1,1] → [0,1]
    return textureSample(skyTex, skySampler, uv, layer);
}
