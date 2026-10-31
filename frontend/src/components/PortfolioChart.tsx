import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type Point = { month: string; inspections: number; findings: number }

export default function PortfolioChart({ data }: { data: Point[] }) {
  return <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data} margin={{ top: 8, right: 7, left: -25, bottom: 0 }}>
      <defs>
        <linearGradient id="careFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#9abf8a" stopOpacity={.35} /><stop offset="100%" stopColor="#9abf8a" stopOpacity={0} /></linearGradient>
        <linearGradient id="inspectFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#90a8dc" stopOpacity={.26} /><stop offset="100%" stopColor="#90a8dc" stopOpacity={0} /></linearGradient>
      </defs>
      <CartesianGrid vertical={false} stroke="#e9ede7" strokeDasharray="4 5" />
      <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#a1aaa0', fontSize: 13, fontFamily: 'DM Sans' }} dy={9} />
      <YAxis axisLine={false} tickLine={false} tick={{ fill: '#a1aaa0', fontSize: 12 }} allowDecimals={false} />
      <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e6eae4', boxShadow: '0 10px 30px #243b2e15', fontSize: 14 }} />
      <Area type="monotone" dataKey="findings" stroke="#8298c1" strokeWidth={2} fill="url(#inspectFill)" name="Findings" />
      <Area type="monotone" dataKey="inspections" stroke="#759d69" strokeWidth={2.5} fill="url(#careFill)" name="Inspections" />
    </AreaChart>
  </ResponsiveContainer>
}
