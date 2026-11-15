import { createStage } from './runtime/scene-foundation';
import { bindCameraInput } from './runtime/camera-input';
import { prepareRasterizer } from './runtime/raster-primitives';
import { createSceneHud } from './runtime/scene-hud';
import { prepareHologramControls } from './runtime/hologram-controls';
import { prepareSceneObjects } from './runtime/scene-objects';
import { createPanelHost } from './runtime/panels-widgets';
import { prepareGuiNodes } from './runtime/gui-nodes';
import { prepareGuiHandles } from './runtime/gui-handles';
import { prepareObjectRenderer } from './runtime/object-renderer';
import { connectObjectFrame } from './runtime/object-frame';
import { startFrameRenderer } from './runtime/frame-renderer';

/** Create the stage first; populate it only after persisted profiles are available. */
export function createScene() {
  createStage();
  bindCameraInput();
  prepareRasterizer();
  createSceneHud();

  return {
    prepareWorkspace() {
      prepareHologramControls();
      prepareSceneObjects();
      createPanelHost();
      prepareGuiNodes();
      prepareGuiHandles();
      prepareObjectRenderer();
      connectObjectFrame();
    },
    start: startFrameRenderer,
  };
}
