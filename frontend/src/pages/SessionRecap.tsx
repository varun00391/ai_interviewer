import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { StructuredInsight } from "../components/StructuredInsight";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";

type RoundRecap = {
  id: number;
  round_type: string;
  questions: unknown[] | null;
  answers: { question?: string; answer?: string }[] | null;
  score_overall: number | null;
  score_breakdown: Record<string, number> | null;
  improvements: string[] | null;
  analytics: Record<string, unknown> | null;
  completed_at: string | null;
  technical_code_preview: string | null;
};

type Recap = {
  id: number;
  role_title: string;
  status: string;
  flow_type: string | null;
  hire_recommendation: Record<string, unknown> | null;
  overall_score_hint: number | null;
  rounds: RoundRecap[];
};

function roundLabel(t: string) {
  if (t === "hr") return "HR round";
  if (t === "technical") return "Technical round";
  if (t === "managerial") return "Managerial round";
  return t;
}

export default function SessionRecap() {
  const { sessionId } = useParams();
  const id = Number(sessionId);
  const [recap, setRecap] = useState<Recap | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<Recap>(`/sessions/${id}/recap`);
      setRecap(data);
    } catch {
      setErr("Could not load recap for this session.");
    }
  }, [id]);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    void load();
  }, [id, load]);

  if (err) {
    return (
      <div className="min-h-screen bg-surface px-4 py-12 max-w-lg mx-auto">
        <Link to="/app" className="text-sm text-accent font-medium">
          ← Dashboard
        </Link>
        <p className="mt-4 text-sm text-red-600">{err}</p>
      </div>
    );
  }

  if (!recap) {
    return (
      <div className="min-h-screen flex items-center justify-center text-mist">
        Loading recap…
      </div>
    );
  }

  const hasRounds = recap.rounds.length > 0;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to={`/app/session/${id}`} className="text-sm text-accent font-medium">
            ← Back to session
          </Link>
          <Link to="/app" className="text-sm text-mist hover:text-ink">
            Dashboard
          </Link>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-teal-50 px-4 py-3">
          <h1 className="font-display text-xl font-bold text-ink">Interview recap</h1>
          <p className="text-sm text-mist mt-1">
            {recap.role_title.trim()
              ? `Target role: ${recap.role_title}`
              : "Target role: (not specified)"}
          </p>
        </div>

        {!hasRounds && (
          <p className="text-sm text-mist">
            No completed rounds yet. Finish at least one round to see questions, your answers, and
            feedback here.
          </p>
        )}

        {recap.hire_recommendation &&
          typeof recap.hire_recommendation === "object" &&
          recap.hire_recommendation !== null && (
            <div className="glass rounded-2xl p-5 space-y-2 border border-slate-200">
              <h2 className="font-display font-semibold text-ink">Hiring recommendation</h2>
              <StructuredInsight data={recap.hire_recommendation} />
            </div>
          )}

        {recap.overall_score_hint != null && hasRounds && (
          <div className="text-2xl font-bold text-accent">
            Average round score: {recap.overall_score_hint.toFixed(1)}
            <span className="text-base text-mist font-medium"> / 10</span>
          </div>
        )}

        {recap.rounds.map((r) => {
          const radarData = r.score_breakdown
            ? Object.entries(r.score_breakdown).map(([k, v]) => ({
                dim: k.replace(/_/g, " "),
                score: Number(v),
              }))
            : [];
          return (
            <article
              key={r.id}
              className="glass rounded-2xl p-6 space-y-5 border border-slate-200/80"
            >
              <header className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-ink">
                  {roundLabel(r.round_type)}
                </h2>
                {r.score_overall != null && (
                  <span className="text-lg font-bold text-accent">
                    {r.score_overall.toFixed(1)} / 10
                  </span>
                )}
              </header>

              {r.answers && r.answers.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-ink mb-3">Questions & your answers</h3>
                  <ol className="space-y-4 list-decimal pl-5">
                    {r.answers.map((qa, i) => (
                      <li key={i} className="text-sm space-y-1.5">
                        <p className="font-medium text-ink">{qa.question || "Question"}</p>
                        <p className="text-mist leading-relaxed pl-0 border-l-2 border-indigo-200 pl-3">
                          {qa.answer || "—"}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}

              {r.improvements && r.improvements.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-ink mb-2">What to improve</h3>
                  <ul className="list-disc pl-5 text-sm text-mist space-y-1">
                    {r.improvements.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </section>
              )}

              {radarData.length > 0 && (
                <div className="h-56 rounded-xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="52%" outerRadius="72%" data={radarData}>
                      <defs>
                        <linearGradient id={`rs-${r.id}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#4f46e5" />
                          <stop offset="100%" stopColor="#a855f7" />
                        </linearGradient>
                        <radialGradient id={`rf-${r.id}`} cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#818cf8" stopOpacity={0.45} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0.08} />
                        </radialGradient>
                      </defs>
                      <PolarGrid gridType="polygon" stroke="#cbd5e1" strokeWidth={0.75} />
                      <PolarAngleAxis
                        dataKey="dim"
                        tick={{ fill: "#334155", fontSize: 10, fontWeight: 600 }}
                        tickLine={false}
                      />
                      <PolarRadiusAxis
                        angle={90}
                        domain={[0, 10]}
                        tickCount={6}
                        tick={{ fill: "#94a3b8", fontSize: 8 }}
                        axisLine={false}
                      />
                      <Radar
                        dataKey="score"
                        stroke={`url(#rs-${r.id})`}
                        strokeWidth={2}
                        fill={`url(#rf-${r.id})`}
                        fillOpacity={1}
                        dot={{ r: 4, fill: "#4f46e5", stroke: "#fff", strokeWidth: 2 }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {r.analytics && typeof r.analytics === "object" && (
                <section>
                  <h3 className="text-sm font-semibold text-ink mb-2">Insights</h3>
                  <div className="rounded-xl border border-slate-200 bg-white/70 p-4">
                    <StructuredInsight data={r.analytics} />
                  </div>
                </section>
              )}

              {r.technical_code_preview && (
                <section>
                  <h3 className="text-sm font-semibold text-ink mb-2">Code snapshot (excerpt)</h3>
                  <pre className="text-xs bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap font-mono">
                    {r.technical_code_preview}
                  </pre>
                </section>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
