import { useEffect, useRef, useState } from "react";
import {
  DrawingUtils,
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import {
  EXERCISES,
  extractSide,
  measureAngle,
  pickSide,
  type ExerciseKey,
} from "../lib/exercises";
import { RepCounter, type CounterState } from "../lib/repCounter";
import {
  scoreRep,
  scoreTone,
  summarizeSession,
  type RepResult,
  type SessionSummary,
} from "../lib/scoring";
import SessionSummaryCard from "./SessionSummaryCard";

// Keep this version identical to the installed npm package version
const WASM_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

type Status = "idle" | "loading" | "running" | "error";

interface Feedback {
  text: string;
  tone: "good" | "warn" | "info";
}

const IDLE_HUD: CounterState = { angle: 0, posture: 0, reps: 0, stage: "unknown" };
const READY: Feedback = {
  text: "Press Start camera, then begin your first rep.",
  tone: "info",
};

export default function PoseCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(-1);
  const exerciseRef = useRef<ExerciseKey>("squat");
  const counterRef = useRef<RepCounter>(new RepCounter(EXERCISES.squat));
  const lastHudRef = useRef<CounterState>(IDLE_HUD);
  const resultsRef = useRef<RepResult[]>([]);
  const sessionStartRef = useRef<number>(0);
  const liveCueRef = useRef<boolean>(false);

  const [exercise, setExercise] = useState<ExerciseKey>("squat");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [hud, setHud] = useState<CounterState>(IDLE_HUD);
  const [results, setResults] = useState<RepResult[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(READY);
  const [liveCue, setLiveCue] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);

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

  /** Clear counter, rep list, summary and feedback (used by Start, Reset and exercise change) */
  function clearSession() {
    counterRef.current.reset();
    lastHudRef.current = IDLE_HUD;
    resultsRef.current = [];
    liveCueRef.current = false;
    setHud(IDLE_HUD);
    setResults([]);
    setSummary(null);
    setLiveCue(false);
    setFeedback(READY);
  }

  function changeExercise(key: ExerciseKey) {
    exerciseRef.current = key;
    counterRef.current = new RepCounter(EXERCISES[key]);
    setExercise(key);
    clearSession();
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

      clearSession();
      sessionStartRef.current = Date.now();
      setFeedback({ text: "Go! Start your first rep.", tone: "info" });
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

    const cfg = EXERCISES[exerciseRef.current];
    setSummary(
      summarizeSession(cfg, resultsRef.current, Date.now() - sessionStartRef.current),
    );
    liveCueRef.current = false;
    setLiveCue(false);
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

        const cfg = EXERCISES[exerciseRef.current];
        const side = pickSide(pose, cfg.joints);
        const body = extractSide(pose, side, vw, vh);

        const angle = measureAngle(cfg, body);
        const postureDeviation = cfg.posture.measure(body);
        const { state, event } = counterRef.current.update(
          angle,
          postureDeviation,
          performance.now(),
        );

        // A rep just finished (or a partial rep was detected)
        if (event) {
          if (event.type === "rep") {
            const repResult = scoreRep(cfg, event.summary, state.reps);
            resultsRef.current = [...resultsRef.current, repResult];
            setResults(resultsRef.current);
            setFeedback({
              text: repResult.feedback.join(" "),
              tone: repResult.issues.length === 0 ? "good" : "warn",
            });
          } else {
            setFeedback({ text: cfg.messages.partial, tone: "warn" });
          }
        }

        // Live posture warning while moving
        const cueNow = state.posture > (cfg.posture.good + cfg.posture.bad) / 2;
        if (cueNow !== liveCueRef.current) {
          liveCueRef.current = cueNow;
          setLiveCue(cueNow);
        }

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
  const cfg = EXERCISES[exercise];
  const averageScore = results.length
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length)
    : null;
  const bannerTone = liveCue ? "warn" : feedback.tone;
  const bannerText = liveCue ? cfg.messages.posture : feedback.text;

  return (
    <div className="card">
      <div className="toolbar">
        <select
          value={exercise}
          disabled={running}
          onChange={(e) => changeExercise(e.target.value as ExerciseKey)}
        >
          {Object.entries(EXERCISES).map(([key, c]) => (
            <option key={key} value={key}>
              {c.label}
            </option>
          ))}
        </select>

        {!running ? (
          <button onClick={start} disabled={status === "loading"}>
            {status === "loading" ? "Loading model..." : "Start session"}
          </button>
        ) : (
          <button className="secondary" onClick={stop}>
            Finish session
          </button>
        )}
        <button className="secondary" onClick={clearSession} disabled={status === "loading"}>
          Reset
        </button>
      </div>

      <p className="muted small">{cfg.cameraHint}</p>
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
            <span className="hud-label">Avg score</span>
            <span
              className={`hud-value ${averageScore === null ? "" : `score tone-${scoreTone(averageScore)}`}`}
            >
              {averageScore ?? "-"}
            </span>
          </div>
        </div>
      </div>

      <div className={`banner banner-${bannerTone}`}>{bannerText}</div>

      {results.length > 0 && (
        <table className="reps">
          <thead>
            <tr>
              <th>Rep</th>
              <th>Score</th>
              <th>Depth</th>
              <th>Posture</th>
              <th>Tempo</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            {[...results]
              .reverse()
              .slice(0, 10)
              .map((r) => (
                <tr key={r.index}>
                  <td>{r.index}</td>
                  <td className={`score tone-${scoreTone(r.score)}`}>{r.score}</td>
                  <td>{r.rom}</td>
                  <td>{r.posture}</td>
                  <td>{r.tempo}</td>
                  <td>{(r.durationMs / 1000).toFixed(1)}s</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {summary && <SessionSummaryCard summary={summary} />}
    </div>
  );
}
