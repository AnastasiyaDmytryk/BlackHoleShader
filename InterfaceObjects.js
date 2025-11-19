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
    static sliderStates = {};

    constructor() {
        this.buttons = {};
        this.sliders = {};
    }

    update() {
        for (const id in this.sliders) {
            if (!Object.hasOwn(this.sliders, id)) continue;
            GuiController.sliderStates[id] = this.sliders[id].value;
        }
        //console.log(GuiController.buttonStates, GuiController.sliderStates);
    }

    addButtons(...args) {
        for (const arg of args) {
            let element = document.getElementById(arg);
            element.addEventListener("click", function(event) {
                let state = GuiController.buttonStates[event.target.id];
                GuiController.buttonStates[event.target.id] = !state;
            });
            this.buttons[arg] = element;
            GuiController.buttonStates[arg] = false;
        }
    }

    addSliders(...args) {
        for (const arg of args) {
            let element = document.getElementById(arg);
            this.sliders[arg] = element;
            GuiController.sliderStates[arg] = element.value;
        }
    }

    getButtonValue(id) {
        return GuiController.buttonStates[id];
    }

    getSliderValue(id) {
        return GuiController.sliderStates[id];
    }
}