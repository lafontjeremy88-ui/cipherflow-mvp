import React, { useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

function generateWeekData() {
  const days = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  return days.map((day) => ({
    label: day,
    emails: Math.floor(Math.random() * 12) + 1,
  }));
}

function generateMonthData() {
  return Array.from({ length: 30 }, (_, i) => ({
    label: `J${i + 1}`,
    emails: Math.floor(Math.random() * 15) + 1,
  }));
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-surface-border rounded-xl px-3 py-2 shadow-card-hover">
      <p className="text-xs font-semibold text-ink-secondary mb-0.5">{label}</p>
      <p className="text-sm font-bold text-ink">
        {payload[0]?.value} email{payload[0]?.value > 1 ? "s" : ""}
      </p>
    </div>
  );
}

export default function EmailsChart() {
  const [period, setPeriod] = useState("week");

  const data = period === "week" ? generateWeekData() : generateMonthData();

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {["week", "month"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={[
              "px-3 py-1 text-xs font-medium rounded-lg border transition-all duration-150",
              period === p
                ? "bg-primary-600 text-white border-transparent"
                : "bg-white text-ink-secondary border-surface-border hover:bg-surface-bg",
            ].join(" ")}
          >
            {p === "week" ? "Semaine" : "Mois"}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="emailGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2563EB" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#94A3B8" }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="emails"
            stroke="#2563EB"
            strokeWidth={2}
            fill="url(#emailGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#2563EB", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
