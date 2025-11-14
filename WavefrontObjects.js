/**
 * Wavefront Objects
 * 
 * Objects or utilities which are used/extended by drawable objects or the GPU.
 * Objects using GPU-dependent rendering code should be defined elsewhere.
 */


/**
 * Object representation of the Wavefront .obj format.
 * 
 * By default creates an empty (invalid) object. Empty fields 
 * should be set by the importer reading the .obj file.
 */
class WavefrontObject
{
    constructor() {
        this.name = undefined;
        this.vertices = [];
        this.coorduvs = [];
        this.normals = [];
        this.faces = [];
        this.materialName = undefined;
        this.material = undefined;
        this.hasTextures = false;
        this.textureData = new TextureData();
    }

    isValid() {
        if (this.name === undefined) return false;
        if (this.materialName === undefined) return false;
        if (this.material === undefined) return false;
        if (this.hasTextures && !this.textureData.isValid()) return false;
        return true;
    }
}


/**
 * Class to import files as WavefrontObjects.
 * 
 * A single .obj file shares vertex data accross multiple objects. Therefore,
 * each WavefrontImporter should be used to import only a single .obj and .mtl
 * pair. The importer also reads an optional .cfg which will be parsed and 
 * returned as additional object parameters.
 */
class WavefrontImporter
{
    constructor() {
        this.materials = {};
        this.texturings = {};
        this.objects = [];
        this.vertices = [];
        this.coorduvs = [];
        this.normals = [];
        this.currentMaterial = undefined;
        this.currentObject = undefined;
        this.currentTexturing = undefined;
        this.currentGroupParent = undefined;
        // TODO: texture file importing
    }

    // Returns a list of WaveFrontObjects parsed from the text
    parse(objText, mtlText) {
        if (objText === undefined || mtlText === undefined)
            throw new Error("Invalid parameters. Cannot parse.\n"+ objText + "\n" + mtlText);

        // Parse through mtl first so that objects will get valid materials
        this.ingestMtlString(mtlText);
        // Parse through obj and add valid objects to this.objects
        this.ingestObjString(objText);

        return this.objects;
    }

    ingestObjString(str) {
        var lines = str.split('\n');
        for (var line of lines) {
            var trim = line.trim();
            if (trim.length == 0) continue;
            if (trim.startsWith('#')) continue;
            var tokens = trim.split(' ');
            var element = tokens[0];
            var data = tokens.slice(1);
            switch (element) {
                // Material library
                case 'mtllib':
                    // No need to do anything. The material file is handled independently.
                    break;

                // Object (delimiter/name)
                case 'o':
                    if (this.currentObject !== undefined && this.currentObject.isValid())
                        this.objects.push(this.currentObject);
                    else if (this.currentObject !== undefined)
                        console.error("A wavefront object was not imported properly.", this.currentObject);
                    this.currentGroupParent = undefined;
                    this.currentObject = new WavefrontObject();
                    this.currentObject.name = data[0];
                    // Since .obj uses vertex buffering, different objects share file-scoped vertex data
                    this.currentObject.vertices = this.vertices;
                    this.currentObject.coorduvs = this.coorduvs;
                    this.currentObject.normals = this.normals;
                    break;

                // Group (material delimiter)
                case 'g':
                    if (this.currentObject === undefined && this.currentGroupParent === undefined) {
                        console.error("Wavefront group element found before object element.");
                        break;
                    }
                    // For first group, make current (unfinished) object the parent; otherwise, push it
                    if (this.currentGroupParent === undefined) {
                        this.currentGroupParent = this.currentObject;
                    } else {
                        if (this.currentObject !== undefined && this.currentObject.isValid())
                        this.objects.push(this.currentObject);
                        else if (this.currentObject !== undefined)
                        console.error("A wavefront group was not imported properly.", this.currentObject);
                    }
                    // Clone the parent object's data to a new group object
                    this.currentObject = new WavefrontObject();
                    this.currentObject.name = this.currentGroupParent.name;
                    // Since .obj uses vertex buffering, different objects share file-scoped vertex data
                    this.currentObject.vertices = this.vertices;
                    this.currentObject.coorduvs = this.coorduvs;
                    this.currentObject.normals = this.normals;
                    break;

                // Vertex
                case 'v':
                    this.vertices.push(data.map(parseFloat));
                    break;

                // Vertex texture (u,v)
                case 'vt':
                    this.coorduvs.push(data.map(parseFloat));
                    break;

                // Vertex normal
                case 'vn':
                    this.normals.push(data.map(parseFloat));
                    break;

                // Material (material name)
                case 'usemtl':
                    this.currentObject.materialName = data[0];
                    this.currentObject.material = this.materials[data[0]];
                    if (this.texturings[data[0]] !== undefined) {
                        this.currentObject.hasTextures = true;
                        this.currentObject.textureData = this.texturings[data[0]];
                    }
                    break;

                // Face (triangle)
                case 'f':
                    var vertices = [];
                    for (var vertex of data) {
                        var tmp = vertex.split('/');
                        // This breaks if I don't use the lambda syntax b/c... idk man, javascript
                        vertices.push(tmp.map((x) => parseInt(x)));
                    }
                    // Faces are local to each object
                    this.currentObject.faces.push(vertices);
                    break;

                // Unnecessary or unsupported (for now)
                case 's': // TODO: each smoothing group can have its own material
                case 'l':
                    break;

                default:
                    console.error("This (" + element + ") probably shouldn't happen.");
                    break;
            }
        }
        // Catch final object
        if (this.currentObject !== undefined && this.currentObject.isValid())
            this.objects.push(this.currentObject);
        else if (this.currentObject !== undefined)
            console.error("A wavefront object was not imported properly.", this.currentObject);
        this.currentObject = undefined;
        this.currentGroupParent = undefined;
    }

    ingestMtlString(str) {
        var lines = str.split('\n');
        for (var line of lines) {
            var trim = line.trim();
            if (trim.length == 0) continue;
            if (trim.startsWith('#')) continue;
            var tokens = trim.split(' ');
            var element = tokens[0];
            var data = tokens.slice(1);
            var argtoken = data.join(' ');
            switch (element) {
                // Material (delimiter/name)
                case 'newmtl':
                    if (this.currentMaterial !== undefined)
                        this.materials[this.currentMaterial.name] = this.currentMaterial;
                    if (this.currentTexturing !== undefined && this.currentTexturing.isValid())
                        this.texturings[this.currentMaterial.name] = this.currentTexturing;
                    // Default values are given to replace missing/unsupported components
                    this.currentMaterial = {
                        name: data[0],
                        kAmbient: [0.5, 0.5, 0.5],
                        kDiffuse: [0.5, 0.5, 0.5],
                        kSpecular: [0, 0, 0],
                        nSpecular: 0.0,
                    };
                    this.currentTexturing = new TextureData();
                    break;

                // Specular exponent
                case 'Ns':
                    this.currentMaterial.nSpecular = parseFloat(data[0]);
                    break;

                // Ambient color
                case 'Ka':
                    this.currentMaterial.kAmbient = data.map(parseFloat);
                    break;

                // Diffuse color
                case 'Kd':
                    this.currentMaterial.kDiffuse = data.map(parseFloat);
                    break;

                // Specular color
                case 'Ks':
                    this.currentMaterial.kSpecular = data.map(parseFloat);
                    break;

                // Ambient map
                case 'map_Ka':
                    var tex = Constants.TEXTURES[argtoken];
                    if (tex === undefined)
                        console.warn('Warning: Material "' + this.currentMaterial.name + '" references missing texture "' + argtoken +'"')
                    this.currentTexturing.ambientTexture = (tex !== undefined) ? tex : null;
                    this.currentTexturing.textureMode = this.currentTexturing.textureMode | WebGpu.TextureMode.AMBIENT;
                    if (tex && tex.sampler !== undefined) this.currentTexturing.sampler = tex.sampler;
                    break;

                // Diffuse map
                case 'map_Kd':
                    var tex = Constants.TEXTURES[argtoken];
                    if (tex === undefined)
                        console.warn('Warning: Material "' + this.currentMaterial.name + '" references missing texture "' + argtoken +'"')
                    this.currentTexturing.diffuseTexture = (tex !== undefined) ? tex : null;
                    this.currentTexturing.textureMode = this.currentTexturing.textureMode | WebGpu.TextureMode.DIFFUSE;
                    if (tex && tex.sampler !== undefined) this.currentTexturing.sampler = tex.sampler;
                    break;

                // Specular map
                case 'map_Ks':
                    var tex = Constants.TEXTURES[argtoken];
                    if (tex === undefined)
                        console.warn('Warning: Material "' + this.currentMaterial.name + '" references missing texture "' + argtoken +'"')
                    this.currentTexturing.specularTexture = (tex !== undefined) ? tex : null;
                    this.currentTexturing.textureMode = this.currentTexturing.textureMode | WebGpu.TextureMode.SPECULAR;
                    if (tex && tex.sampler !== undefined) this.currentTexturing.sampler = tex.sampler;
                    break;

                // Normal/Bump map
                case 'map_bump':
                case 'bump':
                    var tex = Constants.TEXTURES[argtoken];
                    if (tex === undefined)
                        console.warn('Warning: Material "' + this.currentMaterial.name + '" references missing texture "' + argtoken +'"')
                    this.currentTexturing.normalTexture = (tex !== undefined) ? tex : null;
                    this.currentTexturing.textureMode = this.currentTexturing.textureMode | WebGpu.TextureMode.NORMAL;
                    if (tex && tex.sampler !== undefined) this.currentTexturing.sampler = tex.sampler;
                    break;

                // Unnecessary or unsupported (for now)
                case 'Ke':
                case 'Ni':
                case 'd':
                case 'map_d':
                case 'map_refl':
                case 'illum':
                    break;

                default:
                    console.error("This ("+element+") probably shouldn't happen.", this.currentObject);
                    break;
            }
        }
        // Catch final material
        if (this.currentMaterial !== undefined)
            this.materials[this.currentMaterial.name] = this.currentMaterial;
        if (this.currentTexturing !== undefined && this.currentTexturing.isValid())
            this.texturings[this.currentMaterial.name] = this.currentTexturing;
        this.currentMaterial = undefined;
        this.currentTexturing = undefined;
    }
}
