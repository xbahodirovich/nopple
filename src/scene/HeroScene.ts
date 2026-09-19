import * as THREE from 'three';
import { createHouse } from './HouseModel';
import { sampleScroll, STATES, STAGE_PROGRESS, type HouseState, type Stage } from './timeline';

export interface SceneControls {
  setProgress(progress: number): void;
  select(stage: Stage): void;
  setReducedMotion(reduced: boolean): void;
  dispose(): void;
}
export function mountHeroScene(container: HTMLElement, options: {
  reduced: boolean;
  onStage(stage: Stage): void;
  onFailure(): void;
}): SceneControls {
  const compact = matchMedia('(max-width: 760px)').matches;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, compact ? 1.35 : 1.75));
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = !compact;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 100);
  scene.add(new THREE.HemisphereLight('#f2f5e8', '#718075', 2.4));
  const sun = new THREE.DirectionalLight('#fff1d6', 3.5);sun.position.set(-3, 12, 8);sun.castShadow=true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-9;sun.shadow.camera.right=9;sun.shadow.camera.top=9;sun.shadow.camera.bottom=-9;sun.shadow.normalBias=.035;sun.shadow.bias=-.0002;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#b6ddd2',1.5);fill.position.set(8,6,-5);scene.add(fill);
  const house = createHouse(); scene.add(house.root);
  let reduced = options.reduced, visible = true, disposed = false, dirty = true;
  let targetProgress = 0, currentProgress = 0, lastRender = 0, state: HouseState = { ...STATES[0] }, stage: Stage = 0;
  let slowFrames = 0, frames = 0, degraded = false;
  const target=new THREE.Vector3();
  function resize(){
    const {width,height}=container.getBoundingClientRect();
    if(!width||!height)return;
    const isCompact = matchMedia('(max-width: 760px)').matches;
    if (!degraded) renderer.setPixelRatio(Math.min(devicePixelRatio, isCompact ? 1.35 : 1.75));
    renderer.setSize(width,height,false);
    const aspect=width/height;
    const halfHeight=Math.max(6.8,8.8/aspect);
    camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.top=halfHeight;camera.bottom=-halfHeight;camera.updateProjectionMatrix();
    invalidate();
  }
  function render(){
    if(disposed)return;
    house.update(state);
    const elevation=.58+state.interior*.36+state.plan*(Math.PI/2-.941);
    const azimuth=.67*(1-state.plan)+(!reduced?Math.sin(currentProgress*Math.PI)*.035*(1-state.plan):0);
    const radius=22;
    target.set(0,.6*(1-state.plan),0);
    camera.position.set(Math.sin(azimuth)*Math.cos(elevation)*radius,Math.sin(elevation)*radius,Math.cos(azimuth)*Math.cos(elevation)*radius);
    camera.lookAt(target);
    camera.zoom=1+state.plan*.18;
    camera.updateProjectionMatrix();
    renderer.render(scene,camera);
  }
  function changeStage(next:Stage){if(next!==stage){stage=next;options.onStage(next);}}
  function tick(time: number) {
    if (disposed || !visible || document.hidden) return;
    const delta = lastRender ? Math.min(0.1, (time - lastRender) / 1000) : 0.016;
    if (degraded && delta < 1 / 30) return;
    lastRender = time;

    if (reduced) {
      currentProgress = targetProgress;
    } else {
      const diff = targetProgress - currentProgress;
      if (Math.abs(diff) < 0.0005) {
        currentProgress = targetProgress;
      } else {
        currentProgress += diff * (1 - Math.exp(-35 * delta));
      }
    }

    const sample = sampleScroll(currentProgress);
    state = sample.state;
    changeStage(sample.stage);

    const start = performance.now();
    render();
    if (performance.now() - start > 32) slowFrames++;
    if (++frames === 90 && slowFrames > 18 && !degraded) {
      degraded = true;
      renderer.setPixelRatio(1);
      renderer.shadowMap.enabled = false;
      resize();
    }

    dirty = currentProgress !== targetProgress;
    if (!dirty) renderer.setAnimationLoop(null);
  }
  // Scroll events only invalidate. There is no timer or render loop while idle.
  function invalidate() {
    if (disposed) return;
    dirty = true;
    renderer.setAnimationLoop(visible && !document.hidden ? tick : null);
  }
  function sync() {
    if (visible && !document.hidden) invalidate();
    else renderer.setAnimationLoop(null);
  }
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{rootMargin:'80px'});observer.observe(container);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);
  document.addEventListener('visibilitychange',sync);
  function contextLost(event:Event){event.preventDefault();dispose();options.onFailure();}
  renderer.domElement.addEventListener('webglcontextlost',contextLost);
  function dispose(){
    if(disposed)return;disposed=true;renderer.setAnimationLoop(null);observer.disconnect();resizeObserver.disconnect();document.removeEventListener('visibilitychange',sync);renderer.domElement.removeEventListener('webglcontextlost',contextLost);house.dispose();sun.shadow.dispose();renderer.dispose();renderer.domElement.remove();
  }
  resize();sync();container.classList.add('is-ready');
  return {
    setProgress(next) {
      const clamped = Math.min(1, Math.max(0, next));
      if (reduced) {
        targetProgress = currentProgress = clamped;
        const sample = sampleScroll(currentProgress);
        state = sample.state;
        changeStage(sample.stage);
        invalidate();
        return;
      }
      if (clamped === targetProgress && currentProgress === targetProgress) return;
      targetProgress = clamped;
      invalidate();
    },
    select(next) {
      targetProgress = currentProgress = STAGE_PROGRESS[next];
      state = { ...STATES[next] };
      changeStage(next);
      invalidate();
    },
    setReducedMotion(next) {
      reduced = next;
      currentProgress = targetProgress;
      const sample = sampleScroll(currentProgress);
      state = reduced ? { ...STATES[stage] } : sample.state;
      if (!reduced) changeStage(sample.stage);
      invalidate();
    },
    dispose,
  };
}
