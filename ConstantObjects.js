/**
 * WebGPU Constant Definitions
 * 
 * Defines the constants used by the GPU and its renderable objects.
 * Constants should use SCREAMING_SNAKE_CASE and are usually static.
 */


class Constants
{
    // Global light number constants
    static MAX_LIGHT_NUM = Object.freeze({
        DIRECTIONAL: 3,
        POINT: 3,
        SPOT: 3,
        SHADOWED_POINT: 1,
        SHADOWED_SPOT: 1,
    });

    // Global struct or buffer sizes
    static SIZE = Object.freeze({
        CANVAS: 600,
        MATERIAL: 48,
        DIR_LIGHT: 32,
        POINT_LIGHT: 32,
        SPOT_LIGHT: 48,
        OBJECT_UNIFORM: 64+48+16,
        LIGHT_UNIFORM: 32 + Constants.MAX_LIGHT_NUM.DIRECTIONAL*32 + Constants.MAX_LIGHT_NUM.POINT*32 + Constants.MAX_LIGHT_NUM.SPOT*48,
        CAMERA_UNIFORM: 32,
        SHADOW_UNIFORM: 12,
    });

    // Global buffer offset calculations
    static OFFSET = Object.freeze({
        VERTEX: {
            STRIDE: 4*3 + 4*3 + 4*2, // pos(vec3f), nml(vec3f), uvs(vec2f)
            POS: 0,
            NML: 1 * 4*3, // +(vec3 * sizeof(float))
            UVS: 2 * 4*3, // +(vec3 * sizeof(float))
        },
        MATERIAL: {
            K_AMBIENT: 0,
            K_DIFFUSE: 16,
            K_SPECULAR: 32,
            SHINE: 32+12,
        },
        OBJECT_UNIFORM: {
            TRANSFORM: 0,
            MATERIAL: 64,
            TEXTURE_MODE: 112,
        },
        DIR_LIGHT: {
            DIRECTION: 0,
            COLOR: 16,
        },
        POINT_LIGHT: {
            POSITION: 0,
            COLOR: 16,
        },
        SPOT_LIGHT: {
            POSITION: 0,
            DIRECTION: 16,
            CUTOFF: 16+12,
            COLOR: 16+12+4,
        },
        LIGHT_UNIFORM: {
            NUM_POINT_LIGHTS: 0,
            NUM_DIR_LIGHTS: 4,
            NUM_SPOT_LIGHTS: 8,
            AMBIENT_LIGHT: 16,
            DIR_LIGHTS: 32,
            POINT_LIGHTS: 32 + Constants.MAX_LIGHT_NUM.DIRECTIONAL * Constants.SIZE.DIR_LIGHT,
            SPOT_LIGHTS: 32 + Constants.MAX_LIGHT_NUM.DIRECTIONAL * Constants.SIZE.DIR_LIGHT
                            + Constants.MAX_LIGHT_NUM.POINT * Constants.SIZE.POINT_LIGHT,
        },
        CAMERA_UNIFORM: {
            TRANSLATION: 0,
            ROTATION: 16,
        },
        SHADOW_UNIFORM: {
            ARRAY: 0,
            INDEX: 4,
            PASS_DIR: 8,
        },
    });

    static COLOR = Object.freeze({
        CLEAR_COLOR: { r: 146/255, g: 219/255, b: 250/255, a: 1 },
    });

    // Global model list
    static MODELS = [
        'Chappy', 'Strawberry'
    ];
}
