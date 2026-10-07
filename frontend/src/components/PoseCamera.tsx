import { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { EXERCISES, type ExerciseKey } from "../lib/exercises";
import { RepCounter, type CounterState } from "../lib/repCounter";
import { averageVisibility, calculateAngle } from "../lib/geometry";

// Keep this version identical to the installed npm package version
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type Status = "idle" | "loading" | "running" | "error";

export default function PoseCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const exerciseRef = useRef<ExerciseKey>("squat");
  const counterRef = useRef<RepCounter>(new RepCounter(EXERCISES.squat));
  const lastHudRef = useRef<CounterState>({ angle: 0, reps: 0, stage: "unknown" });

  const [exercise, setExercise] = useState<ExerciseKey>("squat");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [hud, setHud] = useState<CounterState>({ angle: 0, reps: 0, stage: "unknown" });

  // Switch exercise -> new counter
  useEffect(() => {
    exerciseRef.current = exercise;
    counterRef.current = new RepCounter(EXERCISES[exercise]);
    lastHudRef.current = { angle: 0, reps: 0, stage: "unknown" };
    setHud({ angle: 0, reps: 0, stage: "unknown" });
  }, [exercise]);

  // Cleanup when leaving the page
  useEffect(() => {
    return () => {
      stopCamera();
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function createLandmarker(): Promise<PoseLandmarker> {
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);
    const make = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numPoses: 1,
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU"); // fallback if GPU is not available
    }
  }

  async function start() {
    try {
      setStatus("loading");
      setError("");

      if (!landmarkerRef.current) {
        landmarkerRef.current = await createLandmarker();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      counterRef.current.reset();
      setStatus("running");
      loop();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
      stopCamera();
    }
  }

  function stop() {
    stopCamera();
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setStatus("idle");
  }

  function loop() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;
    if (!video || !canvas || !landmarker) return;

    if (video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (canvas.width !== vw) canvas.width = vw;
      if (canvas.height !== vh) canvas.height = vh;

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, vw, vh);

      const result = landmarker.detectForVideo(video, performance.now());
      const pose = result.landmarks[0];

      if (pose) {
        const drawing = new DrawingUtils(ctx);
        drawing.drawConnectors(pose, PoseLandmarker.POSE_CONNECTIONS, {
          color: "#22d3ee",
          lineWidth: 3,
        });
        drawing.drawLandmarks(pose, { color: "#f472b6", radius: 3 });

        // Pick the body side that the camera sees better
        const cfg = EXERCISES[exerciseRef.current];
        const leftPts = cfg.left.map((i) => pose[i]);
        const rightPts = cfg.right.map((i) => pose[i]);
        const side =
          averageVisibility(leftPts) >= averageVisibility(rightPts) ? leftPts : rightPts;

        // Convert normalized coords to pixels so the angle is not distorted
        const [a, b, c] = side.map((p) => ({ x: p.x * vw, y: p.y * vh }));
        const state = counterRef.current.update(calculateAngle(a, b, c));

        // Only touch React state when something visible changed
        const last = lastHudRef.current;
        if (
          Math.round(state.angle) !== Math.round(last.angle) ||
          state.reps !== last.reps ||
          state.stage !== last.stage
        ) {
          lastHudRef.current = state;
          setHud(state);
        }
      }
    }

    rafRef.current = requestAnimationFrame(loop);
  }

  const running = status === "running";

  return (
    <div className="card">
      <div className="toolbar">
        <select
          value={exercise}
          onChange={(e) => setExercise(e.target.value as ExerciseKey)}
        >
          {Object.entries(EXERCISES).map(([key, cfg]) => (
            <option key={key} value={key}>
              {cfg.label}
            </option>
          ))}
        </select>

        {!running ? (
          <button onClick={start} disabled={status === "loading"}>
            {status === "loading" ? "Loading model..." : "Start camera"}
          </button>
        ) : (
          <button className="secondary" onClick={stop}>
            Stop
          </button>
        )}
        <button
          className="secondary"
          onClick={() => {
            counterRef.current.reset();
            lastHudRef.current = { angle: 0, reps: 0, stage: "unknown" };
            setHud({ angle: 0, reps: 0, stage: "unknown" });
          }}
        >
          Reset reps
        </button>
      </div>

      {status === "error" && <p className="error">Error: {error}</p>}

      <div className="stage">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
        <div className="hud">
          <div>
            <span className="hud-label">Reps</span>
            <span className="hud-value">{hud.reps}</span>
          </div>
          <div>
            <span className="hud-label">Angle</span>
            <span className="hud-value">{Math.round(hud.angle)}°</span>
          </div>
          <div>
            <span className="hud-label">Stage</span>
            <span className="hud-value small">{hud.stage}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
