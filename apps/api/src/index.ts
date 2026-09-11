import "./env.js";
import cors from "cors";
import express from "express";
import { videosRouter } from "./routes/videos.js";

const app = express();
const port = Number(process.env.API_PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "api" });
});

app.use("/videos", videosRouter);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    const message = err instanceof Error ? err.message : "Internal Server Error";
    const status =
      err && typeof err === "object" && "status" in err
        ? Number((err as { status: number }).status)
        : 500;
    res.status(Number.isFinite(status) ? status : 500).json({ error: message });
  },
);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
