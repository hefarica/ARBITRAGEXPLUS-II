"use client"

import { useState } from "react"
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
  Sector
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Tipos de datos para el componente
interface ProfitBreakdownData {
  name: string;
  value: number;
  color: string;
}

interface ExpenseBreakdownData {
  name: string;
  value: number;
  color: string;
}

interface ProfitBreakdownChartProps {
  profitData: ProfitBreakdownData[];
  expenseData: ExpenseBreakdownData[];
  totalProfit: number;
  totalCost: number;
  period: string;
}

// Componente para renderizar el sector activo del gráfico de pastel
const renderActiveShape = (props: any) => {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    value
  } = props;

  return (
    <g>
      <text x={cx} y={cy} dy={-20} textAnchor="middle" fill="#888">
        {payload.name}
      </text>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill="#333" className="text-lg font-bold">
        ${value.toFixed(2)}
      </text>
      <text x={cx} y={cy} dy={30} textAnchor="middle" fill="#999">
        {(percent * 100).toFixed(1)}%
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 8}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
};

// Componente principal
export function ProfitBreakdownChart({
  profitData,
  expenseData,
  totalProfit,
  totalCost,
  period
}: ProfitBreakdownChartProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("profits");

  // Función para manejar el hover sobre una sección del gráfico
  const onPieEnter = (_: any, index: number) => {
    setActiveIndex(index);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Desglose Financiero ({period})</CardTitle>
        <CardDescription>
          Distribución de ganancias y gastos del período seleccionado
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          defaultValue="profits"
          value={activeTab}
          onValueChange={setActiveTab}
          className="mb-6"
        >
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="profits">Ganancias (${totalProfit.toFixed(2)})</TabsTrigger>
            <TabsTrigger value="expenses">Costos (${totalCost.toFixed(2)})</TabsTrigger>
          </TabsList>

          <TabsContent value="profits">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    activeIndex={activeIndex}
                    activeShape={renderActiveShape}
                    data={profitData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    onMouseEnter={onPieEnter}
                  >
                    {profitData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `$${value.toFixed(2)}`} 
                    labelFormatter={(index) => profitData[index]?.name || ""} 
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              {profitData.map((item, index) => (
                <div key={index} className="flex justify-between items-center">
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <span className="font-medium">${item.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="expenses">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    activeIndex={activeIndex}
                    activeShape={renderActiveShape}
                    data={expenseData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    onMouseEnter={onPieEnter}
                  >
                    {expenseData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `$${value.toFixed(2)}`} 
                    labelFormatter={(index) => expenseData[index]?.name || ""} 
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              {expenseData.map((item, index) => (
                <div key={index} className="flex justify-between items-center">
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-sm">{item.name}</span>
                  </div>
                  <span className="font-medium">${item.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
