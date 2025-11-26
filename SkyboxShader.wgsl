// Skybox bindings
@group(0) @binding(0) var myTexture: texture_cube<f32>;
@group(0) @binding(1) var mySampler: sampler;

// Scene/Camera bindings (from global_renderBindGroup2)
@group(1) @binding(0) var<uniform> cameraMatrix: mat4x4<f32>;
@group(1) @binding(1) var<uniform> debugMatrix: mat4x4<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec3<f32>,
};

@vertex
fn vertexMain(@location(0) position: vec3<f32>) -> VertexOutput {
    var out: VertexOutput;
    
    // Remove translation from camera matrix (skybox centered at camera)
    var viewNoTranslation = cameraMatrix;
    viewNoTranslation[3] = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    
    // Transform position
    let pos = viewNoTranslation * vec4<f32>(position, 1.0);
    
    // Set depth to far plane (w = z ensures it's always behind everything)
    out.position = vec4<f32>(pos.xy, pos.w, pos.w);
    
    // Use vertex position as cubemap direction
    out.texCoord = position;
    
    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    // Sample the cubemap using the interpolated direction
    return textureSample(myTexture, mySampler, in.texCoord);
}