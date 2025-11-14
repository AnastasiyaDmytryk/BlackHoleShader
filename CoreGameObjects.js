/**
 * Core Game Objects
 * 
 * Objects which are simple and used/extended in multiple different contexts.
 * Objects using GPU-dependent rendering code should be defined elsewhere.
 */


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
