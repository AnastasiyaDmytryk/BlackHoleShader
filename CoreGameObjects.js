/**
 * Core Game Objects
 * 
 * Objects which are simple and used/extended in multiple different contexts.
 * Objects using GPU-dependent rendering code should be defined elsewhere.
 */


/**
 * Game object using 3D polar (spherical) coordinates.
 * 
 * Overrides the move() method to use the (rho, theta, phi) tuple 
 * for calculating the (x, y, z) of the object's position.
 */
class Polar3dGameObject extends GameObject
{
    constructor(pol, rot, scl, axis) {
        super(Polar3dGameObject.sphericalToCartesian(pol), rot, scl);
        this.pol = Polar3dGameObject.clampAngles(pol); // Local polar (rho, theta, phi) offset
		this.polVelocity = [0,0,0];
        this.axis = axis;
    }

	calculateNonrotationalOffset() {
		var mTranslate = math.matrix([
			[1.0, 0.0, 0.0, this.loc[0]],
			[0.0, 1.0, 0.0, this.loc[1]],
			[0.0, 0.0, 1.0, this.loc[2]],
			[0.0, 0.0, 0.0, 1.0],
		]);
		var mScale = math.matrix([
			[this.scl[0], 0.0, 0.0, 0.0],
			[0.0, this.scl[1], 0.0, 0.0],
			[0.0, 0.0, this.scl[2], 0.0],
			[0.0, 0.0, 0.0, 1.0],
		]);
        var ret = math.multiply(mTranslate, mScale);
        // console.log(ret);
        return ret;
	}

    move() {
        for (var i = 0; i < 3; i++) {
            this.pol[i] += this.polVelocity[i];
		}
        this.velocity = [0,0,0]; // Override regular movement check
        this.loc = Polar3dGameObject.sphericalToCartesian(this.pol);
        if (this.axis !== undefined && this.axis >= 0 && this.axis <= 2) {
            let first = (this.axis + 1) % 3, second = (this.axis + 2) % 3;
            let tmp = this.loc[first];
            this.loc[first]= this.loc[second];
            this.loc[second]= tmp;
        }
        super.move();
    }
    
    // Override parented render to ignore rotation
    // Kind of a hack; maybe change this later
	_parentedRender(commandPass, mParentOffset) {
		var mWorldOffset = undefined;
		if (mParentOffset) mWorldOffset = math.multiply(mParentOffset, this.mLocalOffset);
		// Render self
		this.renderCounter += 1;
		this.render(commandPass, mWorldOffset);
		// Render children
		for (var child of this.children) {
            var mNonrotOffset = undefined;
            if (mParentOffset) mNonrotOffset = math.multiply(mParentOffset, this.calculateNonrotationalOffset());
			if (mParentOffset === undefined)
				console.warn("Warning: (" + this.id.toString() + ") Rendering children without an offset is unusual.");
			child._parentedRender(commandPass, mNonrotOffset);
		}
	}

    static clampAngles(pol) {
        return [pol[0], pol[1] % (2*Math.PI), pol[2] % (Math.PI)];
    }

    static cartesianToSpherical(loc) {
        let rho = Math.sqrt(
            Math.pow(loc[0], 2) +
            Math.pow(loc[1], 2) +
            Math.pow(loc[2], 2)
        )
        return [
            // rho = sqrt(x^2 + y^2 + z^2)
            rho,
            // theta = arctan(y / x)
            Math.atan2(loc[1], loc[0]),
            // phi = arccos(z / rho)
            Math.acos(loc[2] / rho),
        ];
    }

    static sphericalToCartesian(pol) {
        let cpol = pol; //this.clampAngles(pol);
        return [
            // x (right) = rho * sin(phi) * cos(theta)
            cpol[0] * Math.sin(cpol[2]) * Math.cos(cpol[1]),
            // z (up) = rho * sin(phi)
            cpol[0] * Math.cos(cpol[2]),
            // y (forward) = rho * sin(phi) * sin(theta)
            cpol[0] * Math.sin(cpol[2]) * Math.sin(cpol[1]),
        ];
    }

}

/**
 * Game object representing a planet rotating around its parent.
 * 
 * Calculates its orbit using constructor parameters.
 */
class PlanetBase extends Polar3dGameObject
{
    constructor(pol, rot, scl, rotSpeed, polSpeed, incline, offset, axisMode) {
        super(pol, rot, scl, axisMode);
        this.angVelocity = [...rotSpeed];
        this.polVelocity[1] = polSpeed;
        this.incline = incline;
        this.offset = offset;
    }

    update() {
        // Update self
        this.polVelocity[2] = 0;
        this.pol[2] = Math.PI/2 + this.incline * Math.cos(this.offset + this.pol[1] % (2*Math.PI));
        this.move();
    }
}


/**
 * Root object for rendering other game objects.
 * 
 * Calling render() or update() on this object will cause it to call 
 * the corresponding function on all of its nested children.
 */
class Root extends GameObject
{
    constructor() {
        super([0,0,0], [0,0,0], [1,1,1]);
    }

    // It is improper to call these for root nodes since roots only call children.
    // Calling update() and render() offers more clarity.
    _parentedUpdate() {}
    _parentedRender() {}

    update() {
        // Update children
        for (var child of this.children) {
            child._parentedUpdate();
        }
    }

    render(commandPass) {
        // Render children
        for (var child of this.children) {
            child._parentedRender(commandPass, this.mLocalOffset);
        }
    }
}


/**
 * Base object for extending cameras.
 */
class CameraBase extends GameObject
{
    constructor(loc, rot) {
        super(loc, rot, [1,1,1]);
    }

    // Unnecessary for cameras. Overriding saves resources
    calculateOffset() {}
}


/**
 * Base object for extending lights.
 */
class LightBase extends GameObject
{
    constructor(loc, dir, col) {
        super(loc, [0,0,0], [1,1,1]);
        this.direction = dir;
        this.color = col;
    }

    // Unnecessary for lights. Overriding saves resources
    calculateOffset() {}
}


/**
 * Wrapper around the HTMLAudioElement player.
 * 
 * Contains world information used by the game engine.
 */
class MusicObject
{
    constructor(file, pos, maxDist, fadeDist, restartable, loop) {
        this.pos = pos;
        this.maxDist = maxDist;
        this.fadeDist = fadeDist;
        this.isResartable = restartable;
        this.player = new Audio(file);
        this.isPlaying = false;
        this.player.loop = loop;
    }

    play() {
        this.player.play();
        this.isPlaying = true;
    }

    pause() {
        this.isPlaying = false;
        this.player.pause();
    }

    stop() {
        this.isPlaying = false;
        this.player.pause();
        if (this.isResartable) this.player.currentTime = 0;
    }
}


// TODO: make this less hardcoded (if we want to use it)
class MusicController
{
    constructor() {
        this.bgtrack = new MusicObject("./Sounds/Pikmin 3 Deluxe - Tropical Wilds.mp3", [0,0,0], undefined, 0, false, true);
        this.bgtrack.player.volume = 0;
        this.startTime = undefined;
        this.running = false;
        this.isReady = true;
    }

    update() {
        if (!this.isReady) return;
        let camPos = gpu.camera.loc;
        let currentTime = Date.now();
        let timeSinceStart = currentTime - this.startTime;

        if (timeSinceStart >= 5000 && timeSinceStart <= 30000)
            this.bgtrack.player.volume = (1 - ((30000 - (timeSinceStart)) / (30000 - 5000)));
    }

    start() {
        if (!this.isReady) return;
        this.running = true;
        this.startTime = Date.now();
        this.bgtrack.play();
    }

    stop() {
        if (!this.isReady) return;
        this.bgtrack.stop();
        this.running = false;
    }
}
