import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = { stroke: "#9aa3b2", fontSize: 11 };
const GRID = "#2a2f3a";
const ACCENT = "#4f8cff";

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <ResponsiveContainer width="100%" height={240}>
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}

export function SessionsPerDayChart({ data }: { data: { day: string; sessions: number }[] }) {
  return (
    <Frame title="Sessions par jour">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="day" {...AXIS} tickFormatter={(d) => d.slice(4, 10)} />
        <YAxis {...AXIS} allowDecimals={false} />
        <Tooltip contentStyle={{ background: "#1f232c", border: `1px solid ${GRID}` }} />
        <Line type="monotone" dataKey="sessions" stroke={ACCENT} dot={false} strokeWidth={2} />
      </LineChart>
    </Frame>
  );
}

export function EventNameChart({ data }: { data: { name: string; count: number }[] }) {
  return (
    <Frame title="Distribution des événements">
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="name" {...AXIS} interval={0} angle={-20} textAnchor="end" height={60} />
        <YAxis {...AXIS} allowDecimals={false} />
        <Tooltip contentStyle={{ background: "#1f232c", border: `1px solid ${GRID}` }} />
        <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} />
      </BarChart>
    </Frame>
  );
}

export function DurationBucketsChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <Frame title="Durée des sessions">
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="label" {...AXIS} />
        <YAxis {...AXIS} allowDecimals={false} />
        <Tooltip contentStyle={{ background: "#1f232c", border: `1px solid ${GRID}` }} />
        <Bar dataKey="count" fill="#3ecf8e" radius={[4, 4, 0, 0]} />
      </BarChart>
    </Frame>
  );
}

export function QuestionTypeChart({
  data,
  onSelect,
  selected,
}: {
  data: { type: string; count: number }[];
  onSelect: (type: string | null) => void;
  selected: string | null;
}) {
  return (
    <Frame title="Types de questions (cliquer pour filtrer)">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 120 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" {...AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="type" {...AXIS} width={120} />
        <Tooltip contentStyle={{ background: "#1f232c", border: `1px solid ${GRID}` }} />
        <Bar
          dataKey="count"
          radius={[0, 4, 4, 0]}
          onClick={(d: { type?: string }) =>
            onSelect(d.type === selected ? null : d.type ?? null)
          }
          cursor="pointer"
        >
          {data.map((d) => (
            <Cell key={d.type} fill={d.type === selected ? "#f5a623" : ACCENT} />
          ))}
        </Bar>
      </BarChart>
    </Frame>
  );
}

export function RelevanceHistogramChart({ data }: { data: { score: string; count: number }[] }) {
  const colors: Record<string, string> = {
    "1": "#ff5c5c",
    "2": "#ff5c5c",
    "3": "#f5a623",
    "4": "#3ecf8e",
    "5": "#3ecf8e",
  };
  return (
    <Frame title="Histogramme de pertinence (1–5)">
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="score" {...AXIS} />
        <YAxis {...AXIS} allowDecimals={false} />
        <Tooltip contentStyle={{ background: "#1f232c", border: `1px solid ${GRID}` }} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.score} fill={colors[d.score]} />
          ))}
        </Bar>
      </BarChart>
    </Frame>
  );
}

export function FlagBarChart({ data }: { data: { flag: string; count: number }[] }) {
  return (
    <Frame title="Drapeaux de pertinence">
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 130 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis type="number" {...AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="flag" {...AXIS} width={130} />
        <Tooltip contentStyle={{ background: "#1f232c", border: `1px solid ${GRID}` }} />
        <Bar dataKey="count" fill="#f5a623" radius={[0, 4, 4, 0]} />
      </BarChart>
    </Frame>
  );
}

export function RelevanceTrendChart({ data }: { data: { day: string; avg: number }[] }) {
  return (
    <Frame title="Pertinence moyenne par jour">
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={GRID} />
        <XAxis dataKey="day" {...AXIS} tickFormatter={(d) => d.slice(4, 10)} />
        <YAxis {...AXIS} domain={[1, 5]} />
        <Tooltip contentStyle={{ background: "#1f232c", border: `1px solid ${GRID}` }} />
        <Line type="monotone" dataKey="avg" stroke="#3ecf8e" dot={false} strokeWidth={2} />
      </LineChart>
    </Frame>
  );
}
