
// Uniform definitions
struct CameraUniform {
    translation: vec4f,
    rotation: vec4f,
};
@group(1) @binding(0) var<uniform> u_camera: CameraUniform;
@group(1) @binding(1) var<uniform> u_debug: u32;


// Non-uniform binding definitions
@group(0) @binding(0) var mySampler: sampler;
@group(0) @binding(1) var myTexture: texture_cube<f32>;


// Other struct definitions
struct FragmentParams {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec3<f32>,
};


// Various helper functions

fn rotateCamera(vert: vec4f) -> vec4f {
    let rcos: vec4f = cos(-1.0 * u_camera.rotation);
    let rsin: vec4f = sin(-1.0 * u_camera.rotation);

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

    return (rotMz * rotMy * rotMx) * vert;
}

fn perspectiveProjectCamera(vert: vec4f) -> vec4f {
    let n: f32 = 0.00001;
    let r: f32 = 0.00001;
    let t: f32 = 0.00001;
    let f: f32 = 1.0;

    var perspectiveM: mat4x4<f32> = mat4x4<f32>(
        vec4( n/r, 0.0,         0.0, 0.0 ),
        vec4( 0.0, n/t,         0.0, 0.0 ),
        vec4( 0.0, 0.0, (f+n)/(f-n), 1.0 ),
        vec4( 0.0, 0.0, 2*f*n/(f-n), 1.0 ),
    );

    return perspectiveM * vert;
}



// Vertex shader entry point
@vertex
fn vertexMain(@location(0) pos: vec3<f32>) -> FragmentParams {
    var ret: FragmentParams;
    let rotated = rotateCamera(vec4<f32>(pos, 1.0));
    let projected = perspectiveProjectCamera(rotated);
    // Set to far plane (z = w means depth = 1.0, furthest possible)
    ret.position = vec4<f32>(projected.xy, projected.w, projected.w);
    ret.texCoord = pos;
    return ret;
}


// Fragment shader entry point
@fragment
fn fragmentMain(params: FragmentParams) -> @location(0) vec4<f32> {
    return textureSample(myTexture, mySampler, params.texCoord);
}