import { useEffect, useState, useRef } from "react";
import api from "../api/client";
import type { Report } from "../types";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Filler,
} from "chart.js";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Download, Loader2 } from "lucide-react";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Filler,
);

const currency = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#06b6d4",
];

export default function Reports() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [period, setPeriod] = useState("month");
  const [breakdown, setBreakdown] = useState("category");
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    api
      .get<Report>("/reports", { params: { period, breakdown } })
      .then((r) => setReport(r.data))
      .finally(() => setLoading(false));
  }, [period, breakdown]);

  // Exportar PDF usando html2canvas + jsPDF via CDN
  const exportPDF = async () => {
    if (!reportRef.current || !report) return;
    setExportingPDF(true);
    try {
      // Carregar libs dinamicamente (não precisam estar no package.json)
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import(
          "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js" as any
        ),
        import(
          "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js" as any
        ),
      ]).catch(() => {
        // Fallback: usar CDN via script tag
        throw new Error("CDN");
      });

      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      // Se maior que uma página, dividir
      if (pdfHeight <= 297) {
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      } else {
        let posY = 0;
        const pageH = 297;
        while (posY < pdfHeight) {
          if (posY > 0) pdf.addPage();
          pdf.addImage(imgData, "PNG", 0, -posY, pdfWidth, pdfHeight);
          posY += pageH;
        }
      }

      const periodLabel =
        period === "week"
          ? "semana"
          : period === "month"
            ? "mes"
            : period === "quarter"
              ? "trimestre"
              : "ano";
      pdf.save(
        `relatorio-${periodLabel}-${format(new Date(), "yyyy-MM-dd")}.pdf`,
      );
    } catch {
      // Fallback mais simples: window.print() com CSS de impressão
      window.print();
    } finally {
      setExportingPDF(false);
    }
  };

  const categoryData = {
    labels: report?.breakdown.map((b) => b.category ?? b.type ?? "") ?? [],
    datasets: [
      {
        data:
          report?.breakdown.map(
            (b) => b.total ?? (b.income ?? 0) + (b.expense ?? 0),
          ) ?? [],
        backgroundColor: COLORS,
        borderWidth: 0,
      },
    ],
  };
  const lineData = {
    labels:
      report?.breakdown.map((b) => {
        const d = b.transaction_date ?? b.week_start ?? "";
        return d ? format(parseISO(d), "dd/MM", { locale: ptBR }) : "";
      }) ?? [],
    datasets: [
      {
        label: "Receitas",
        data: report?.breakdown.map((b) => b.income ?? 0) ?? [],
        borderColor: "#22c55e",
        backgroundColor: "#22c55e20",
        fill: true,
        tension: 0.4,
      },
      {
        label: "Gastos",
        data: report?.breakdown.map((b) => b.expense ?? 0) ?? [],
        borderColor: "#ef4444",
        backgroundColor: "#ef444420",
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const periodOptions = [
    { value: "week", label: "Esta semana" },
    { value: "month", label: "Este mês" },
    { value: "quarter", label: "Este trimestre" },
    { value: "year", label: "Este ano" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Relatórios
          </h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            Análise detalhada das suas finanças
          </p>
        </div>

        {/* Export PDF */}
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
            {periodOptions.map((o) => (
              <button
                key={o.value}
                onClick={() => setPeriod(o.value)}
                className={`text-xs font-medium px-3 py-1.5 rounded transition-colors ${
                  period === o.value
                    ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button
            onClick={exportPDF}
            disabled={exportingPDF || loading || !report}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {exportingPDF ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Gerando...
              </>
            ) : (
              <>
                <Download size={14} /> Exportar PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Seletor breakdown */}
      <div className="flex gap-3">
        <select
          className="input w-auto"
          value={breakdown}
          onChange={(e) => setBreakdown(e.target.value)}
        >
          <option value="category">Por categoria</option>
          <option value="day">Por dia</option>
          <option value="week">Por semana</option>
        </select>
      </div>

      {/* Conteúdo exportável */}
      <div
        ref={reportRef}
        className="space-y-6 bg-white dark:bg-transparent print:bg-white"
      >
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                {
                  label: "Receitas totais",
                  value: currency(report?.summary.totalIncome ?? 0),
                  color: "text-green-600",
                },
                {
                  label: "Gastos totais",
                  value: currency(report?.summary.totalExpense ?? 0),
                  color: "text-red-600",
                },
                {
                  label: "Saldo",
                  value: currency(report?.summary.balance ?? 0),
                  color:
                    (report?.summary.balance ?? 0) >= 0
                      ? "text-green-600"
                      : "text-red-600",
                },
                {
                  label: "Taxa de poupança",
                  value: `${report?.summary.savingsRate ?? 0}%`,
                  color: "text-blue-600",
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  className="card print:shadow-none print:border"
                >
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                    {label}
                  </p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
              ))}
            </div>

            {/* Gráficos */}
            {breakdown === "category" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card print:shadow-none print:border">
                  <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
                    Gastos por categoria
                  </h2>
                  {report?.breakdown.length ? (
                    <div className="h-56">
                      <Doughnut
                        data={categoryData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: {
                              position: "right",
                              labels: { boxWidth: 12, font: { size: 12 } },
                            },
                          },
                          cutout: "65%",
                        }}
                      />
                    </div>
                  ) : (
                    <EmptyChart />
                  )}
                </div>
                <div className="card print:shadow-none print:border">
                  <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
                    Top categorias
                  </h2>
                  {report?.breakdown.length ? (
                    <div className="h-56">
                      <Bar
                        data={{
                          labels: report.breakdown
                            .slice(0, 8)
                            .map((b) => b.category ?? ""),
                          datasets: [
                            {
                              label: "Total",
                              data: report.breakdown
                                .slice(0, 8)
                                .map((b) => b.total ?? 0),
                              backgroundColor: COLORS,
                              borderRadius: 6,
                              borderWidth: 0,
                            },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: {
                            y: {
                              grid: { color: "#f3f4f6" },
                              ticks: {
                                callback: (v) =>
                                  "R$" + Number(v).toLocaleString("pt-BR"),
                              },
                            },
                            x: { grid: { display: false } },
                          },
                        }}
                      />
                    </div>
                  ) : (
                    <EmptyChart />
                  )}
                </div>
              </div>
            ) : (
              <div className="card print:shadow-none print:border">
                <h2 className="font-semibold text-gray-900 dark:text-white mb-4">
                  Evolução {breakdown === "day" ? "diária" : "semanal"}
                </h2>
                {report?.breakdown.length ? (
                  <div className="h-64">
                    <Line
                      data={lineData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: "top" } },
                        scales: {
                          y: {
                            grid: { color: "#f3f4f6" },
                            ticks: {
                              callback: (v) =>
                                "R$" + Number(v).toLocaleString("pt-BR"),
                            },
                          },
                          x: { grid: { display: false } },
                        },
                      }}
                    />
                  </div>
                ) : (
                  <EmptyChart />
                )}
              </div>
            )}

            {/* Tabela de detalhamento */}
            <div className="card p-0 overflow-hidden print:shadow-none print:border">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    Detalhamento
                  </h2>
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {report?.period.start &&
                      report?.period.end &&
                      `${format(parseISO(report.period.start), "dd/MM/yyyy")} – ${format(parseISO(report.period.end), "dd/MM/yyyy")}`}
                  </span>
                </div>
              </div>
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                  <tr>
                    <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-6 py-3">
                      {breakdown === "category" ? "Categoria" : "Período"}
                    </th>
                    {breakdown === "category" ? (
                      <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-6 py-3">
                        Total
                      </th>
                    ) : (
                      <>
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-6 py-3">
                          Receitas
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-6 py-3">
                          Gastos
                        </th>
                        <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase px-6 py-3">
                          Saldo
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {report?.breakdown.map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-6 py-3 text-sm text-gray-900 dark:text-white font-medium">
                        {row.category ??
                          row.type ??
                          ((row.transaction_date
                            ? format(
                                parseISO(row.transaction_date),
                                "dd/MM/yyyy",
                                { locale: ptBR },
                              )
                            : "") ||
                            (row.week_start
                              ? format(
                                  parseISO(row.week_start),
                                  "'Sem.' dd/MM",
                                  { locale: ptBR },
                                )
                              : ""))}
                      </td>
                      {breakdown === "category" ? (
                        <td className="px-6 py-3 text-sm font-semibold text-red-600 text-right">
                          {currency(row.total ?? 0)}
                        </td>
                      ) : (
                        <>
                          <td className="px-6 py-3 text-sm text-green-600 font-medium text-right">
                            {currency(row.income ?? 0)}
                          </td>
                          <td className="px-6 py-3 text-sm text-red-600 font-medium text-right">
                            {currency(row.expense ?? 0)}
                          </td>
                          <td
                            className={`px-6 py-3 text-sm font-semibold text-right ${(row.income ?? 0) - (row.expense ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {currency((row.income ?? 0) - (row.expense ?? 0))}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex items-center justify-center h-48 text-gray-400">
      <p className="text-sm">Sem dados para este período</p>
    </div>
  );
}
