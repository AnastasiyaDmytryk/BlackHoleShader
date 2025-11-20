
// Uniform definitions
struct ObjectUniform {      // size 64
    transform: mat4x4<f32>, // byte 0
};
@group(0) @binding(0) var<uniform> u_object: ObjectUniform;

struct CameraUniform {
    translation: vec4f,
    rotation: vec4f,
};
@group(2) @binding(0) var<uniform> u_camera: CameraUniform;


// Non-uniform binding definitions
@group(1) @binding(0) var g_textureSampler: sampler;
@group(1) @binding(1) var g_screenTexture: texture_2d<f32>;


// Struct definitions
struct FragmentParams {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
};


// Various helper functions

fn distort_blackhole(uv: vec2f) -> vec2f {
    let center = vec2f(0.5, 0.5);
    let offset = uv - center;
    let r = length(offset);

    let radius = 0.2;
    let strength = 0.5;

    if (r < radius) {
        let distort = 1.0 / (1.0 + r * 6.0 * strength);
        return center + offset * distort;
    }
    return uv;
}


// Vertex shader entry point
@vertex
fn vertexMain(@location(0) pos: vec3f, @location(1) nml: vec3f, @location(2) uvs: vec2f) -> FragmentParams {
    var ret: FragmentParams;
    ret.pos = vec4f(pos,1);
    ret.uv = pos.xy * 0.5 + 0.5;
    ret.uv.y = 1 - ret.uv.y;
    return ret;
}


// Fragment shader entry point
@fragment
fn fragmentMain(params: FragmentParams) -> @location(0) vec4f {
    var uv = distort_blackhole(params.uv);
    var color = textureSample(g_screenTexture, g_textureSampler, uv);

    // Add a tint to the black hole
    let center = vec2f(0.5, 0.5);
    let distToCenter = length(params.uv - center);
    let tintRadius = 0.2;
    if (distToCenter < tintRadius) {
        let tintStrength = (1.0 - distToCenter / tintRadius);
        let tintColor = vec3f(0.2, 0.5, 1.0); // blueish tint

        // construct a new vec4f with tinted rgb
        color = vec4f(mix(color.xyz, tintColor, tintStrength), color.a);
    }

    return color;
}
