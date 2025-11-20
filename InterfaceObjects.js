/**
 * WebGPU GUI class definitions.
 * 
 * Defines the classes controlling the HTML GUI elements.
 * The GPU can read from these classes to change its own behavior.
 */


class GuiController
{
    // Static makes it easier for event listeners to access these
    static buttonStates = {};
    static toggleStates = {};
    static sliderStates = {};

    constructor() {
        this.buttons = {};
        this.toggles = {};
        this.sliders = {};
    }

    update() {
        for (const id in this.sliders) {
            if (!Object.hasOwn(this.sliders, id)) continue;
            GuiController.sliderStates[id] = this.sliders[id].value;
        }
        for (const id in this.toggles) {
            if (!Object.hasOwn(this.toggles, id)) continue;
            GuiController.toggleStates[id] = this.toggles[id].checked;
        }
        //console.log(GuiController.buttonStates, GuiController.toggleStates, GuiController.sliderStates);
    }

    addButtons(...args) {
        for (const arg of args) {
            let element = document.getElementById(arg);
            element.addEventListener("click", function(event) {
                let state = GuiController.buttonStates[event.target.id];
                GuiController.buttonStates[event.target.id] = state + 1;
            });
            this.buttons[arg] = element;
            GuiController.buttonStates[arg] = 0;
        }
    }

    addToggles(...args) {
        for (const arg of args) {
            let element = document.getElementById(arg);
            this.toggles[arg] = element;
            GuiController.toggleStates[arg] = element.checked;
        }
    }

    addSliders(...args) {
        for (const arg of args) {
            let element = document.getElementById(arg);
            this.sliders[arg] = element;
            GuiController.sliderStates[arg] = element.value;
        }
    }

    static getButtonValue(id) {
        return GuiController.buttonStates[id];
    }

    static getToggleValue(id) {
        return GuiController.toggleStates[id];
    }

    static getSliderValue(id) {
        return GuiController.sliderStates[id];
    }
}


class SingularityGuiController extends GuiController
{
    update() {
        super.update();
        gpu.singularity.effectRadius = GuiController.getSliderValue("control_effectRadius");
        gpu.singularity.horizonRadius = GuiController.getSliderValue("control_horizonRadius");
        gpu.singularity.haloFalloff = GuiController.getSliderValue("control_haloFalloff");
        gpu.singularity.pushStrength = GuiController.getSliderValue("control_pushStrength");
        gpu.singularity.warpStrength = GuiController.getSliderValue("control_warpStrength");
        gpu.singularity.bendStrength = GuiController.getSliderValue("control_bendStrength");
    }
}