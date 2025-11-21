
// Constant and override definitions
const PI: f32 = 3.141592653589793;

const TEXTURE_MODE_NONE:     u32 = 0;
const TEXTURE_MODE_AMBIENT:  u32 = 1 << 0;
const TEXTURE_MODE_DIFFUSE:  u32 = 1 << 1;
const TEXTURE_MODE_SPECULAR: u32 = 1 << 2;
const TEXTURE_MODE_NORMAL:   u32 = 1 << 3;

const MAX_LIGHT_NUM_DIR:   u32 = 3;
const MAX_LIGHT_NUM_POINT: u32 = 3;
const MAX_LIGHT_NUM_SPOT:  u32 = 3;


// Uniform definitions
struct Material {     // size 48
    kAmbient: vec3f,  // byte 0
    kDiffuse: vec3f,  // byte 16
    kSpecular: vec3f, // byte 32
    shine: f32,       // byte 32+12=44
};
struct ObjectUniform {      // size 128
    transform: mat4x4<f32>, // byte 0
    material: Material,     // byte 64
    textureMode: u32,       // byte 112
};
@group(0) @binding(0) var<uniform> u_object: ObjectUniform;


struct DirLight {     // size 32
    direction: vec3f, // byte 0
    color: vec3f,     // byte 16
};
struct PointLight {   // size 32
    position: vec3f,  // byte 0
    color: vec3f,     // byte 16
};
struct SpotLight {    // size 48
    position: vec3f,  // byte 0
    direction: vec3f, // byte 16
    cutoff: f32,      // byte 16+12=28
    color: vec3f,     // byte 28+4=32
};
struct LightUniform {    // size 512+10*48=992
    numPointLights: u32, // byte 0
    numDirLights: u32,   // byte 4
    numSpotLights: u32,  // byte 8
    ambientLight: vec3f, // byte 16
    dirLights: array<DirLight, MAX_LIGHT_NUM_DIR>, // byte 32
    pointLights: array<PointLight, MAX_LIGHT_NUM_POINT>, // byte 32+5*32=192
    spotLights: array<SpotLight, MAX_LIGHT_NUM_SPOT>, // byte 192+10*32=512
};
@group(1) @binding(0) var<uniform> u_lights: LightUniform;


struct CameraUniform {
    translation: vec4f,
    rotation: vec4f,
};
@group(2) @binding(0) var<uniform> u_camera: CameraUniform;
@group(2) @binding(1) var<uniform> u_debug: u32;


// Non-uniform binding definitions
@group(0) @binding(1) var g_objectSampler: sampler;
@group(0) @binding(2) var g_ambientTexture: texture_2d<f32>;
@group(0) @binding(3) var g_diffuseTexture: texture_2d<f32>;
@group(0) @binding(4) var g_specularTexture: texture_2d<f32>;
@group(0) @binding(5) var g_normalTexture: texture_2d<f32>;


// Other struct definitions
struct FragmentParams {
    @builtin(position) position: vec4f,
    @location(0) normal: vec3f,
    @location(1) world: vec3f,
    @location(2) camera: vec3f,
    @location(3) texuv: vec2f,
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


fn transformLight(vert: vec4f, arr: u32, idx: u32) -> vec4f {
    var plight: PointLight;
    var slight: SpotLight;
    var transM: mat4x4<f32>;

    if (arr == 0) {
    plight = u_lights.pointLights[idx];
    transM =  mat4x4<f32>(
        vec4f( 1.0, 0.0, 0.0, 0.0 ),
        vec4f( 0.0, 1.0, 0.0, 0.0 ),
        vec4f( 0.0, 0.0, 1.0, 0.0 ),
        vec4f( -1.0*plight.position.x, -1.0*plight.position.y, -1.0*plight.position.z, 1.0 ),
    );
    } else {
    slight = u_lights.spotLights[idx];
    transM =  mat4x4<f32>(
        vec4f( 1.0, 0.0, 0.0, 0.0 ),
        vec4f( 0.0, 1.0, 0.0, 0.0 ),
        vec4f( 0.0, 0.0, 1.0, 0.0 ),
        vec4f( -1.0*slight.position.x, -1.0*slight.position.y, -1.0*slight.position.z, 1.0 ),
    );
    }

    return transM * vert;
}

fn perspectiveProjectLight(vert: vec4f) -> vec4f {
    let n: f32 = 0.001;
    let r: f32 = 0.001;
    let t: f32 = 0.001;
    let f: f32 = 100.0;
    let fdg: f32 = 2.0;

    var perspectiveM: mat4x4<f32> = mat4x4<f32>(
        vec4( n/r, 0.0,           0.0, 0.0 ),
        vec4( 0.0, n/t,           0.0, 0.0 ),
        vec4( 0.0, 0.0,   (f+n)/(f-n), 1.0 ),
        vec4( 0.0, 0.0, fdg*f*n/(f-n), 1.0 ),
    );

    return perspectiveM * vert;
}


fn cubemapRotate(vert: vec4f, side: u32) -> vec4f {
    var rotation: vec4f = vec4f(0.0);

    switch (side) {
        case 0: { rotation.y =  PI / 2; break; } // +X
        case 1: { rotation.y = -PI / 2; break; } // -X
        case 2: { rotation.x = -PI / 2; break; } // +Y
        case 3: { rotation.x =  PI / 2; break; } // -Y
        case 4: { rotation.y =   0; break; } // +Z
        case 5: { rotation.y =  PI; break; } // -Z
        default: { break; }
    }

    let rcos: vec4f = cos(-1.0 * rotation);
    let rsin: vec4f = sin(-1.0 * rotation);

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

    return (rotMy * rotMx) * vert;
}

fn cubemapDirection(v: vec3<f32>, o: vec3<f32>) -> u32 {
    let point: vec3f = v - o;
    var face: u32 = 0;
    if (abs(point.x) >= abs(point.y) && abs(point.x) >= abs(point.z)) { face = 0; }
    else if (abs(point.y) >= abs(point.x) && abs(point.y) >= abs(point.z)) { face = 2; }
    else if (abs(point.z) >= abs(point.x) && abs(point.z) >= abs(point.y)) { face = 4; }
    if (point[face / 2] < 0) { face += 1; }
    return face;
}


fn reflectVec(i: vec3<f32>, n: vec3<f32>) -> vec3<f32> {
    return i - 2.0 * dot(n, i) * n;
}


fn isClip(v: vec3<f32>) -> bool {
    let xClip = (-1.0 <= v.x && v.x <= 1.0);
    let yClip = (-1.0 <= v.y && v.y <= 1.0);
    let zClip = ( 0.0 <= v.z && v.z <= 1.0);
    return (xClip && yClip && zClip);
}

fn isClipUV(v: vec3<f32>) -> bool {
    let xClip = (0.0 <= v.x && v.x <= 1.0);
    let yClip = (0.0 <= v.y && v.y <= 1.0);
    let zClip = (0.0 <= v.z && v.z <= 1.0);
    return (xClip && yClip && zClip);
}



// Vertex shader entry point
@vertex
fn vertexMain(@location(0) pos: vec3f, @location(1) nml: vec3f, @location(2) uvs: vec2f) -> FragmentParams {
    var ret: FragmentParams;
    var tform: mat4x4<f32> = u_object.transform;
    ret.world = (tform * vec4f(pos, 1)).xyz;
    ret.position = perspectiveProjectCamera(transformCamera(vec4(ret.world, 1)));
    ret.normal = (u_object.transform * vec4f(nml, 0)).xyz;
    ret.camera = u_camera.translation.xyz - ret.world.xyz;
    ret.texuv = vec2f(uvs.x, 1 - uvs.y);
    return ret;
}


// Fragment shader entry point
@fragment
fn fragmentMain(params: FragmentParams) -> @location(0) vec4f {
    // Phong model brightness coefficients
    var iAmbient: vec3f = u_lights.ambientLight;
    var iDiffuse: vec3f = vec3<f32>(0.0);
    var iSpecular: vec3f = vec3<f32>(0.0);
    // Phong model vectors (some calculated per light)
    var toSource: vec3f; // normalize(light.position.xyz - params.world.xyz);
    var toViewer: vec3f = normalize(params.camera.xyz);
    var normal: vec3f = normalize(params.normal.xyz);
    var reflect: vec3f; // normalize(reflect(-toSource, normal).xyz);

    // Normal mapping
    let sampleNormal: vec4f = textureSample(g_normalTexture, g_objectSampler, params.texuv);
    if (bool(u_object.textureMode & TEXTURE_MODE_NORMAL)) {
        let dx: vec3f = normalize(dpdx(params.world));
        let dy: vec3f = normalize(dpdy(params.world));
        let bitangent: vec3f = normalize(cross(normal, dx));
        let tangent: vec3f = normalize(cross(bitangent, normal));
        let tbnmat: mat3x3<f32> = mat3x3<f32>(tangent, bitangent, normal);
            
        // Adjust to world space normal
        let adjustedNormal: vec3f = normalize(sampleNormal.xyz * 2 - 1.0);
        normal = normalize(tbnmat * adjustedNormal);
    }

    // Shared loop variables
    var iterations: u32;
    var iIlluminance: f32;
    var iFocus: f32;

    // Directional lights
    var dirLight: DirLight;
    iterations = min(u_lights.numDirLights, MAX_LIGHT_NUM_DIR);
    for (var i = 0u; i < iterations; i++) {
        dirLight = u_lights.dirLights[i];
        toSource = normalize(-1.0 * dirLight.direction.xyz);

        // Diffuse light
        iIlluminance = max(dot(normal, toSource), 0.0);
        iDiffuse += dirLight.color.rgb * iIlluminance;
    }

    // Point lights
    var pointLight: PointLight;
    iterations = min(u_lights.numPointLights, MAX_LIGHT_NUM_POINT);
    for (var i = 0u; i < iterations; i++) {
        pointLight = u_lights.pointLights[i];
        toSource = normalize(pointLight.position.xyz - params.world.xyz);

        // Diffuse light
        iIlluminance = max(dot(normal, toSource), 0.0);
        iIlluminance /= (1 + 3 * pow(length(toSource), 2));
        iDiffuse += pointLight.color.rgb * iIlluminance;
        // Specular light
        if (iIlluminance > 0.1 && u_object.material.shine != 0.0) {
            reflect = normalize(reflectVec(-toSource, normal).xyz);
            //iHalfVec = half(-toSource, toViewer);
            iIlluminance = pow(max(dot(reflect, toViewer), 0.0), u_object.material.shine);
            iIlluminance /= (1 + 3 * pow(length(toSource), 2));
            iSpecular += pointLight.color.rgb * iIlluminance;
        }
    }

    // Spotlights
    var spotLight: SpotLight;
    iterations = min(u_lights.numSpotLights, MAX_LIGHT_NUM_SPOT);
    for (var i = 0u; i < iterations; i++) {
        spotLight = u_lights.spotLights[i];
        toSource = normalize(spotLight.position.xyz - params.world.xyz);

        // Zero light unless the pixel is in the spotlight's focus
        iFocus = dot(toSource, normalize(-1.0 * spotLight.direction.xyz));
        if (iFocus < spotLight.cutoff) { continue; }

        // Diffuse light
        iIlluminance = max(dot(normal, toSource), 0.0);
        iDiffuse += spotLight.color.rgb * iIlluminance;
        // Specular light
        if (iIlluminance > 0.1 && u_object.material.shine != 0.0) {
            reflect = normalize(reflectVec(-toSource, normal).xyz);
            //iHalfVec = half(-toSource, toViewer);
            iIlluminance = pow(max(dot(reflect, toViewer), 0.0), u_object.material.shine);
            iIlluminance /= (0.1 + length(toSource));
            iSpecular += spotLight.color.rgb * iIlluminance;
        }
    }

    // Material colors
    var final_ka: vec3f = u_object.material.kAmbient;
    var final_kd: vec3f = u_object.material.kDiffuse;
    var final_ks: vec3f = u_object.material.kSpecular;
    if (u_object.textureMode == TEXTURE_MODE_NONE) {
        switch (u_debug) {
            case 1: {
                return vec4f(final_ka, 1);
            }
            case 2: {
                return vec4f(final_kd, 1);
            }
            case 3: {
                return vec4f(final_ks, 1);
            }
            case 4: {
                return vec4f(normal * 0.5 + 0.5, 1);
            }
            default: {}
        }
        // Phong model: TotalColor = kA * iA + kD * iD + kS * iS
        return vec4f(final_ka*iAmbient + final_kd*iDiffuse + final_ks*iSpecular, 1.0);
    }

    // Texture mapping
    let sampleAmbient: vec4f = textureSample(g_ambientTexture, g_objectSampler, params.texuv);
    let sampleDiffuse: vec4f = textureSample(g_diffuseTexture, g_objectSampler, params.texuv);
    let sampleSpecular: vec4f = textureSample(g_specularTexture, g_objectSampler, params.texuv);
    if (bool(u_object.textureMode & TEXTURE_MODE_AMBIENT)) { final_ka = sampleAmbient.rgb; }
    if (bool(u_object.textureMode & TEXTURE_MODE_DIFFUSE)) { final_kd = sampleDiffuse.rgb; }
    if (bool(u_object.textureMode & TEXTURE_MODE_SPECULAR)) { final_ks = sampleSpecular.rgb; }

    switch (u_debug) {
        case 1: {
            return vec4f(final_ka, 1);
        }
        case 2: {
            return vec4f(final_kd, 1);
        }
        case 3: {
            return vec4f(final_ks, 1);
        }
        case 4: {
            return vec4f(normal * 0.5 + 0.5, 1);
        }
        default: {}
    }

    // Phong model: TotalColor = kA * iA + kD * iD + kS * iS
    return vec4f(final_ka*iAmbient + final_kd*iDiffuse + final_ks*iSpecular, sampleDiffuse.a);
}
