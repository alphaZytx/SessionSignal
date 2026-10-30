import { Chart, registerables } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import ChartDataLabels from 'chartjs-plugin-datalabels';

Chart.register(...registerables, annotationPlugin, ChartDataLabels);

globalThis.Chart = Chart;
globalThis.ChartDataLabels = ChartDataLabels;

export { Chart, ChartDataLabels };
