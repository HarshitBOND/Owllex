import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Invoice } from '@/components/types/invoice';

interface RevenueChartProps {
  invoices: Invoice[];
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#6b7280'];
const COLOR_DOT_CLASSES = ['bg-[#10b981]', 'bg-[#f59e0b]', 'bg-[#ef4444]', 'bg-[#6b7280]'];

export function RevenueChart({ invoices }: RevenueChartProps) {
  const monthlyData = useMemo(() => {
    const months: { [key: string]: { revenue: number; pending: number } } = {};
    
    invoices.forEach((invoice) => {
      const monthKey = new Date(invoice.issueDate).toLocaleDateString('en-US', {
        month: 'short',
      });
      
      if (!months[monthKey]) {
        months[monthKey] = { revenue: 0, pending: 0 };
      }
      
      if (invoice.status === 'paid') {
        months[monthKey].revenue += invoice.paidAmount;
      } else {
        months[monthKey].pending += invoice.total;
      }
    });
    
    return Object.entries(months).map(([month, data]) => ({
      month,
      ...data,
    }));
  }, [invoices]);

  const statusData = useMemo(() => {
    const counts = { paid: 0, pending: 0, overdue: 0, draft: 0 };
    invoices.forEach((invoice) => {
      counts[invoice.status]++;
    });
    return [
      { name: 'Paid', value: counts.paid },
      { name: 'Pending', value: counts.pending },
      { name: 'Overdue', value: counts.overdue },
      { name: 'Draft', value: counts.draft },
    ].filter((item) => item.value > 0);
  }, [invoices]);

  return (
    <div className="grid lg:grid-cols-3 gap-3 sm:gap-6">
      {/* Area Chart */}
      <div className="lg:col-span-2 rounded-lg sm:rounded-xl border bg-card p-2 sm:p-6 overflow-hidden">
        <h3 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-4">Revenue Overview</h3>
        <div className="h-[140px] sm:h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={monthlyData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="month" className="text-[10px] sm:text-xs" tick={{ fontSize: 10 }} />
              <YAxis
                className="text-[10px] sm:text-xs"
                tick={{ fontSize: 10 }}
                tickFormatter={(value) => `$${value / 1000}k`}
                width={35}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#6366f1"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
                name="Revenue"
              />
              <Area
                type="monotone"
                dataKey="pending"
                stroke="#f59e0b"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorPending)"
                name="Pending"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie Chart */}
      <div className="rounded-lg sm:rounded-xl border bg-card p-2 sm:p-6 overflow-hidden">
        <h3 className="text-sm sm:text-lg font-semibold mb-2 sm:mb-4">Invoice Status</h3>
        <div className="h-[100px] sm:h-[200px] w-full flex items-center justify-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={25}
                outerRadius={40}
                paddingAngle={5}
                dataKey="value"
              >
                {statusData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 sm:mt-4 grid grid-cols-2 gap-1 sm:gap-2">
          {statusData.map((item, index) => (
            <div key={item.name} className="flex items-center justify-between text-[10px] sm:text-sm">
              <div className="flex items-center gap-1 sm:gap-2">
                <div
                  className={`h-2 w-2 sm:h-3 sm:w-3 rounded-full shrink-0 ${COLOR_DOT_CLASSES[index % COLOR_DOT_CLASSES.length]}`}
                />
                <span className="truncate">{item.name}</span>
              </div>
              <span className="font-medium">{item.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
