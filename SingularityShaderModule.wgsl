
// Uniform definitions
struct ObjectUniform {      // size 64
    transform: mat4x4<f32>, // byte 0
};
@group(0) @binding(0) var<uniform> u_object: ObjectUniform;

struct SingularityUniform {
    center: vec3f,
    radius: f32,
}
@group(1) @binding(0) var<uniform> u_singularity: SingularityUniform;

struct CameraUniform {
    translation: vec4f,
    rotation: vec4f,
};
@group(2) @binding(0) var<uniform> u_camera: CameraUniform;


// Non-uniform binding definitions
@group(1) @binding(1) var g_textureSampler: sampler;
@group(1) @binding(2) var g_screenTexture: texture_2d<f32>;


// Struct definitions
struct FragmentParams {
    @builtin(position) position: vec4f,
    @location(0) screen: vec2f,
};


// Various helper functions

fn transformCamera(vert: vec4f) -> vec4f {
    var transM: mat4x4<f32> = mat4x4<f32>(
        vec4f( 1.0, 0.0, 0.0, 0.0 ),
        vec4f( 0.0, 1.0, 0.0, 0.0 ),
        vec4f( 0.0, 0.0, 1.0, 0.0 ),
        vec4f( -1.0*u_camera.translation.x, -1.0*u_camera.translation.y, -1.0*u_camera.translation.z, 1.0 ),
    );

    let rcos: vec4f = cos(-1.0*u_camera.rotation);
    let rsin: vec4f = sin(-1.0*u_camera.rotation);

    var rotMx: mat4x4<f32> = mat4x4<f32>(
        vec4f( 1.0,     0.0,    0.0, 0.0 ),
        vec4f( 0.0,  rcos.x, rsin.x, 0.0 ),
        vec4f( 0.0, -rsin.x, rcos.x, 0.0 ),
        vec4f( 0.0,     0.0,    0.0, 1.0 ),
    );
    var rotMy: mat4x4<f32> = mat4x4<f32>(
        vec4f( rcos.y, 0.0, -rsin.y, 0.0 ),
        vec4f(    0.0, 1.0,     0.0, 0.0 ),
        vec4f( rsin.y, 0.0,  rcos.y, 0.0 ),
        vec4f(    0.0, 0.0,     0.0, 1.0 ),
    );
    var rotMz: mat4x4<f32> = mat4x4<f32>(
        vec4f(  rcos.z, rsin.z, 0.0, 0.0 ),
        vec4f( -rsin.z, rcos.z, 0.0, 0.0 ),
        vec4f(     0.0,    0.0, 1.0, 0.0 ),
        vec4f(     0.0,    0.0, 0.0, 1.0 ),
    );

    return (rotMz * rotMy * rotMx) * transM * vert;
}

fn perspectiveProjectCamera(vert: vec4f) -> vec4f {
    let n: f32 = 0.00001;
    let r: f32 = 0.00001;
    let t: f32 = 0.00001;
    let f: f32 = 5000.0;

    var perspectiveM: mat4x4<f32> = mat4x4<f32>(
        vec4( n/r, 0.0,         0.0, 0.0 ),
        vec4( 0.0, n/t,         0.0, 0.0 ),
        vec4( 0.0, 0.0, (f+n)/(f-n), 1.0 ),
        vec4( 0.0, 0.0, 2*f*n/(f-n), 1.0 ),
    );

    return perspectiveM * vert;
}


fn distort_blackhole(uv: vec2f, center: vec2f, radius: f32) -> vec2f {
    let offset = uv - center;
    let r = length(offset);

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
    ret.position = vec4f(pos, 1);
    ret.screen = pos.xy * 0.5 + 0.5;
    ret.screen.y = 1 - ret.screen.y;
    return ret;
}


// Fragment shader entry point
@fragment
fn fragmentMain(params: FragmentParams) -> @location(0) vec4f {
    // TODO: This shouldn't be done for every pixel
    let world = u_singularity.center.xyz;
    let truepos = perspectiveProjectCamera(transformCamera(vec4(world, 1)));
    let radius = u_singularity.radius / truepos.w;
    let center = vec2f(truepos.x / truepos.w * 0.5 + 0.5, 1 - (truepos.y / truepos.w * 0.5 + 0.5));

    var uv = distort_blackhole(params.screen, center, radius);
    var color = textureSample(g_screenTexture, g_textureSampler, uv);

    // Add a tint to the black hole
    let distToCenter = length(params.screen - center);
    let tintRadius = radius;
    if (distToCenter < tintRadius) {
        let tintStrength = (1.0 - distToCenter / tintRadius);
        let tintColor = vec3f(0.2, 0.5, 1.0); // blueish tint

        // construct a new vec4f with tinted rgb
        color = vec4f(mix(color.xyz, tintColor, tintStrength), color.a);
    }

    return color;
}
