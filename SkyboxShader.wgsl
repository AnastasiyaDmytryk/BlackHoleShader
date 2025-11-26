@group(0) @binding(0) var myTexture: texture_cube<f32>;
@group(0) @binding(1) var mySampler: sampler;

struct Camera {
    viewMatrix: mat4x4<f32>,
    projectionMatrix: mat4x4<f32>,
};

@group(1) @binding(0) var<uniform> camera: Camera;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) texCoord: vec3<f32>,
};

@vertex
fn vertexMain(@location(0) pos: vec3<f32>) -> VertexOutput {
    var out: VertexOutput;
    
    // Remove translation from view matrix (skybox stays centered on camera)
    var viewNoTranslation = camera.viewMatrix;
    viewNoTranslation[3][0] = 0.0;
    viewNoTranslation[3][1] = 0.0;
    viewNoTranslation[3][2] = 0.0;
    
    // Transform with camera
    let worldPos = viewNoTranslation * vec4<f32>(pos, 1.0);
    let clipPos = camera.projectionMatrix * worldPos;
    
    // Push to far plane (so everything renders in front of it)
    out.position = vec4<f32>(clipPos.xy, clipPos.w, clipPos.w);
    out.texCoord = pos; // Use original position as cubemap direction
    
    return out;
}

@fragment
fn fragmentMain(in: VertexOutput) -> @location(0) vec4<f32> {
    // NOW sample the texture
    return textureSample(myTexture, mySampler, in.texCoord);
}