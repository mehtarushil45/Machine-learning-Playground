/**
 * ProjectGatekeeper — Onboarding & Dataset Ingestion Hub
 *
 * Layout Requirements:
 * 1. Open, flat design (no nested block/card containers).
 * 2. Top: Compact horizontal Upload Dataset ingestion bar (drag & drop, browse button).
 * 3. Below: 3 open columns:
 *    - Left: Previous Uploads (exactly 5 items, line by line, dynamically updates on new upload, NO row/column details).
 *    - Middle: Learn with Ready-Made Examples (5 items line by line with 1-click Try button).
 *    - Right: User Guide (5 concise actionable steps line by line).
 * 4. Strictly NO vertical scrollbar (fits 100% within the viewport).
 * 5. Step 2 Modal: Name the Python experiment file and enter the studio.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload,
  FileCode,
  ArrowLeft,
  Sparkles,
  AlertCircle,
  X,
  Clock,
  BookOpen,
  FileText,
  Layers,
} from 'lucide-react';
import { useProject } from '../../providers/ProjectContext';
import { parseCsvFile } from '../../services/csvService';
import { validateCsvFile } from '../../utils/validation';
import { computeClientProfile } from '../../services/profilerService';
import { apiClient } from '../../services/apiClient';
import type { Dataset, DatasetProfile } from '../../types/dataset';

const BB = {
  base: '#08070F',
  surface: '#120E22',
  elevated: '#18132E',
  border: 'rgba(138, 121, 202, 0.16)',
  borderLight: 'rgba(167, 139, 250, 0.32)',
  primaryLight: '#8A79CA',
  gold: '#F59E0B',
  text: '#FFFFFF',
  textSecondary: '#E2E8F0',
  muted: '#94A3B8',
  disabled: '#475569',
  success: '#10B981',
  error: '#F87171',
} as const;

const PREVIOUS_UPLOADS_KEY = 'ml_previous_uploads_v2';
const MAX_PREVIOUS_UPLOADS = 5;

interface PreviousUploadItem {
  id: string;
  fileName: string;
  uploadedAt: string;
  csvContent?: string;
  datasetId?: string;
}

interface ReadyMadeExample {
  id: string;
  name: string;
  fileName: string;
  task: 'Classification' | 'Regression';
  icon: string;
  csvContent: string;
}

/* ── Embedded Benchmark CSVs (Curated Academic Benchmarks >=50 Rows) ── */
const TITANIC_SAMPLE_CSV = [
  'pclass,sex,age,sibsp,parch,fare,embarked,survived',
  '3,male,22.0,1,0,7.25,S,0',
  '1,female,38.0,1,0,71.28,C,1',
  '3,female,26.0,0,0,7.92,S,1',
  '1,female,35.0,1,0,53.10,S,1',
  '3,male,35.0,0,0,8.05,S,0',
  '3,male,54.0,0,0,8.46,Q,0',
  '1,male,54.0,0,0,51.86,S,0',
  '3,male,2.0,3,1,21.07,S,0',
  '3,female,27.0,0,2,11.13,S,1',
  '2,female,14.0,1,0,30.07,C,1',
  '3,female,4.0,1,1,16.70,S,1',
  '1,female,58.0,0,0,26.55,S,1',
  '3,male,20.0,0,0,8.05,S,0',
  '3,male,39.0,1,5,31.27,S,0',
  '3,female,14.0,0,0,7.85,S,0',
  '2,female,55.0,0,0,16.00,S,1',
  '3,male,2.0,4,1,29.12,Q,0',
  '2,male,34.0,0,0,13.00,S,1',
  '3,female,31.0,1,0,18.00,S,0',
  '3,female,22.0,0,0,7.22,C,1',
  '3,female,51.7,0,0,8.33,Q,0',
  '1,male,7.0,0,0,100.25,Q,1',
  '3,male,18.9,0,1,7.08,S,0',
  '2,female,18.6,1,0,21.4,C,0',
  '3,female,51.0,0,2,11.92,Q,1',
  '3,male,41.4,1,0,9.96,C,0',
  '3,female,28.9,0,1,9.11,C,1',
  '2,female,43.4,0,0,14.9,C,1',
  '3,female,48.1,1,1,9.98,S,0',
  '2,female,18.3,2,1,19.44,Q,1',
  '3,male,14.0,0,0,14.01,Q,0',
  '3,male,27.8,3,0,13.42,S,0',
  '1,female,54.9,0,0,72.7,C,1',
  '3,female,47.9,0,1,16.76,Q,1',
  '2,female,33.6,2,1,17.9,Q,1',
  '3,female,59.8,0,0,14.92,S,1',
  '1,female,42.7,0,0,70.37,C,1',
  '2,female,10.4,0,0,32.82,S,1',
  '3,female,21.7,1,0,9.75,Q,0',
  '3,male,30.1,0,0,18.69,C,1',
  '1,male,6.3,0,0,25.9,Q,0',
  '1,female,59.2,0,0,108.62,S,1',
  '3,male,20.3,0,0,8.23,Q,0',
  '2,male,59.4,0,0,29.39,S,0',
  '2,female,20.7,0,0,22.66,C,1',
  '3,female,32.9,1,0,7.66,Q,0',
  '3,female,15.5,0,0,12.21,S,1',
  '1,male,21.7,1,0,77.88,Q,0',
  '3,male,14.8,0,2,14.53,Q,1',
  '2,female,41.8,0,1,14.72,Q,1',
  '1,female,47.5,0,0,136.29,S,1',
  '1,female,31.4,0,0,141.84,S,1',
  '2,male,29.9,0,0,19.49,S,1',
  '3,female,9.6,0,0,19.13,S,0',
  '2,female,32.6,0,0,39.52,Q,1',
].join('\n');

const IRIS_SAMPLE_CSV = [
  'sepal_length,sepal_width,petal_length,petal_width,species',
  '5.3,2.9,1.2,0.2,setosa',
  '5.4,3.9,1.8,0.1,setosa',
  '5.0,2.9,1.2,0.4,setosa',
  '4.4,3.2,1.6,0.4,setosa',
  '4.7,3.8,1.7,0.1,setosa',
  '5.5,3.9,1.3,0.2,setosa',
  '5.7,3.4,1.1,0.1,setosa',
  '5.6,3.8,1.7,0.5,setosa',
  '5.2,4.4,1.3,0.4,setosa',
  '5.6,3.8,1.8,0.4,setosa',
  '5.4,3.0,1.2,0.2,setosa',
  '4.5,3.2,1.1,0.2,setosa',
  '5.3,3.4,1.3,0.2,setosa',
  '4.8,4.3,1.6,0.4,setosa',
  '4.6,4.0,1.1,0.3,setosa',
  '5.8,3.9,1.5,0.4,setosa',
  '5.6,4.1,1.2,0.1,setosa',
  '4.8,3.3,1.2,0.6,setosa',
  '5.6,3.4,1.6,0.3,setosa',
  '5.7,3.6,1.2,0.2,setosa',
  '6.1,2.4,4.2,1.7,versicolor',
  '5.8,2.3,5.1,1.4,versicolor',
  '5.2,2.1,3.2,1.5,versicolor',
  '6.6,2.6,3.1,1.3,versicolor',
  '7.0,2.7,5.0,1.7,versicolor',
  '5.0,3.0,4.4,1.4,versicolor',
  '5.5,2.9,3.2,1.3,versicolor',
  '5.9,3.3,4.8,1.2,versicolor',
  '6.0,2.3,4.9,1.7,versicolor',
  '5.6,2.9,4.3,1.1,versicolor',
  '6.5,2.8,4.6,1.4,versicolor',
  '5.0,2.5,3.0,1.7,versicolor',
  '6.8,3.2,3.6,1.0,versicolor',
  '6.8,3.3,3.2,1.4,versicolor',
  '5.1,3.1,4.6,1.1,versicolor',
  '6.0,2.8,3.6,1.7,versicolor',
  '5.8,2.3,4.1,1.6,versicolor',
  '5.4,2.4,5.1,1.5,versicolor',
  '5.9,2.7,3.3,1.2,versicolor',
  '5.7,2.8,3.5,1.2,versicolor',
  '5.9,3.3,5.4,2.4,virginica',
  '7.6,2.6,5.5,2.3,virginica',
  '6.2,2.7,6.8,2.2,virginica',
  '6.8,3.5,6.5,1.9,virginica',
  '6.0,3.1,5.8,2.1,virginica',
  '7.3,3.4,6.9,1.9,virginica',
  '6.6,2.9,6.6,2.0,virginica',
  '6.2,3.1,5.8,2.0,virginica',
  '6.3,3.7,5.8,2.4,virginica',
  '7.0,2.6,6.9,2.4,virginica',
  '7.8,3.7,6.6,1.9,virginica',
  '6.8,2.8,5.8,1.8,virginica',
  '6.6,3.8,5.5,2.3,virginica',
  '6.8,3.0,6.8,2.5,virginica',
  '7.0,3.4,5.3,2.0,virginica',
  '7.8,3.3,6.0,2.3,virginica',
  '5.9,3.3,6.0,2.4,virginica',
  '6.1,3.7,5.2,1.9,virginica',
  '7.0,3.4,5.4,1.9,virginica',
  '7.7,2.8,6.1,2.2,virginica',
].join('\n');

const STUDENT_SAMPLE_CSV = [
  'hours_studied,attendance_pct,previous_score,sleep_hours,tutoring_sessions,exam_score',
  '6.9,65.9,58.8,5.9,0,78.5',
  '9.1,68.0,66.1,5.1,1,87.7',
  '6.6,84.6,80.8,7.8,3,87.7',
  '6.5,93.3,45.3,8.2,3,82.8',
  '2.8,98.5,61.8,5.4,0,68.8',
  '4.4,74.3,47.2,6.8,0,70.3',
  '4.7,84.3,86.5,7.5,2,82.2',
  '7.5,66.6,56.4,6.2,0,81.6',
  '8.9,78.3,67.7,8.3,1,90.3',
  '3.3,74.3,91.8,7.6,1,74.0',
  '3.6,81.2,58.5,8.7,1,70.9',
  '8.7,92.2,56.5,5.1,2,92.1',
  '2.1,97.0,73.4,7.9,1,71.4',
  '4.9,97.0,67.9,6.1,1,81.5',
  '6.1,91.1,66.4,7.3,2,82.8',
  '10.0,82.8,49.5,5.2,0,89.0',
  '2.9,88.8,74.8,6.5,3,75.2',
  '9.8,95.1,45.6,7.9,2,96.9',
  '4.4,75.3,52.9,5.0,2,74.7',
  '8.0,82.8,50.3,7.5,1,83.1',
  '8.0,83.9,83.9,7.1,0,91.2',
  '5.7,68.9,63.1,8.9,2,75.9',
  '3.5,84.9,48.9,7.9,0,69.6',
  '6.0,69.4,78.0,8.8,1,78.8',
  '8.9,79.8,55.6,7.2,1,90.3',
  '4.9,88.5,63.7,8.6,3,78.1',
  '3.4,76.8,74.4,5.9,1,68.2',
  '7.5,67.1,48.4,5.1,2,78.4',
  '3.5,88.4,55.7,5.5,3,71.8',
  '5.5,79.2,49.7,7.6,2,75.8',
  '5.5,90.5,78.7,8.9,0,78.9',
  '7.7,93.0,50.5,5.8,3,87.2',
  '3.1,81.2,88.7,5.3,0,69.7',
  '10.0,94.3,93.4,8.7,1,100.0',
  '5.6,72.5,65.1,5.2,3,76.8',
  '4.8,97.4,84.3,6.1,3,84.0',
  '4.0,98.9,74.0,7.2,2,77.1',
  '6.5,82.6,87.6,5.6,0,87.5',
  '2.1,67.4,88.1,6.6,1,67.4',
  '1.8,67.9,77.9,7.3,2,68.0',
  '3.2,90.1,56.9,6.6,2,71.1',
  '9.4,97.8,45.5,7.5,0,88.8',
  '3.3,74.3,91.7,8.5,1,72.9',
  '2.8,94.2,80.2,7.4,0,73.4',
  '6.2,97.6,50.2,8.5,2,80.8',
  '2.4,84.4,58.6,7.4,2,65.6',
  '6.9,74.2,69.4,8.6,0,79.0',
  '5.1,74.7,45.2,8.1,2,70.8',
  '5.3,89.7,73.0,5.4,1,81.2',
  '8.6,85.4,52.4,5.5,2,89.1',
  '9.4,99.0,47.0,6.4,1,94.4',
  '4.5,84.6,88.7,8.9,1,82.5',
].join('\n');

const CANCER_SAMPLE_CSV = [
  'radius_mean,texture_mean,perimeter_mean,area_mean,smoothness_mean,compactness_mean,concavity_mean,symmetry_mean,diagnosis',
  '12.84,12.25,79.3,123.9,0.0995,0.0941,0.0725,0.1461,benign',
  '11.53,12.3,70.7,104.5,0.0711,0.0559,0.0555,0.1781,benign',
  '10.32,17.89,66.7,73.7,0.1022,0.0959,0.0338,0.1509,benign',
  '14.74,15.37,90.1,162.5,0.1039,0.0883,0.0665,0.1911,benign',
  '12.22,21.73,76.0,118.3,0.1032,0.0895,0.0703,0.1804,benign',
  '13.23,12.46,81.5,133.2,0.0732,0.0586,0.0171,0.1595,benign',
  '12.81,15.65,79.7,123.0,0.0807,0.1149,0.0554,0.1826,benign',
  '10.03,19.29,61.0,76.6,0.1096,0.0912,0.049,0.1879,benign',
  '14.06,19.76,86.7,145.8,0.0826,0.0614,0.0248,0.206,benign',
  '14.26,15.15,90.5,157.5,0.1066,0.0767,0.0285,0.1573,benign',
  '12.37,14.63,78.2,128.1,0.086,0.0575,0.0798,0.1757,benign',
  '9.55,12.47,57.6,74.1,0.1017,0.0738,0.0144,0.1667,benign',
  '14.98,17.29,96.9,183.4,0.0705,0.0977,0.0577,0.1776,benign',
  '10.6,18.41,64.2,86.9,0.0881,0.1163,0.0713,0.1584,benign',
  '12.0,13.79,77.8,120.5,0.0819,0.0911,0.0526,0.1507,benign',
  '13.58,17.39,87.0,145.4,0.07,0.0659,0.0114,0.205,benign',
  '14.27,20.32,88.5,151.0,0.1051,0.1158,0.016,0.174,benign',
  '9.42,19.61,60.8,62.2,0.089,0.084,0.0286,0.2011,benign',
  '11.54,14.12,72.7,109.1,0.078,0.0649,0.0797,0.1855,benign',
  '11.63,17.18,70.8,100.7,0.0835,0.0871,0.0261,0.1554,benign',
  '9.43,18.31,57.6,77.9,0.1044,0.0457,0.0267,0.1868,benign',
  '10.29,13.32,67.2,84.5,0.0889,0.1028,0.0665,0.1533,benign',
  '9.58,16.31,59.7,71.4,0.0992,0.0939,0.0789,0.1469,benign',
  '11.42,15.39,73.9,97.4,0.0776,0.0759,0.0395,0.1595,benign',
  '10.5,21.23,65.6,93.8,0.092,0.044,0.0799,0.1985,benign',
  '14.81,21.26,95.1,165.5,0.0894,0.0571,0.0381,0.1441,benign',
  '11.27,21.85,69.4,105.4,0.0882,0.0738,0.077,0.2097,benign',
  '12.33,19.18,75.4,115.3,0.1087,0.0863,0.048,0.1924,benign',
  '9.34,17.84,58.7,75.5,0.0763,0.1169,0.0156,0.153,benign',
  '12.57,18.75,77.4,116.4,0.1056,0.0597,0.0516,0.1834,benign',
  '11.52,17.84,72.5,112.9,0.0782,0.0973,0.0267,0.1677,benign',
  '13.03,15.0,80.7,138.3,0.0729,0.0767,0.0799,0.2097,benign',
  '9.44,14.13,57.9,78.6,0.1052,0.1103,0.0359,0.151,benign',
  '14.0,19.04,88.6,163.6,0.0962,0.0406,0.0672,0.161,benign',
  '21.14,27.39,141.6,375.4,0.1043,0.1919,0.1545,0.2284,malignant',
  '21.6,20.04,149.6,396.8,0.1195,0.2377,0.2692,0.1874,malignant',
  '19.1,20.77,127.3,337.2,0.1255,0.1541,0.2482,0.2241,malignant',
  '19.14,18.1,128.2,342.9,0.1362,0.1909,0.2669,0.2266,malignant',
  '16.76,19.27,115.3,276.5,0.1318,0.2319,0.2798,0.1968,malignant',
  '17.62,19.03,125.6,299.1,0.1163,0.2007,0.1309,0.2544,malignant',
  '22.85,27.76,159.3,465.1,0.101,0.2158,0.1664,0.2545,malignant',
  '22.32,26.64,156.0,421.7,0.1315,0.1341,0.2744,0.2487,malignant',
  '17.39,26.17,120.9,269.6,0.1318,0.1496,0.1047,0.1955,malignant',
  '18.29,26.64,131.7,293.8,0.1257,0.172,0.2962,0.2229,malignant',
  '23.48,19.15,165.0,459.9,0.1385,0.1545,0.1217,0.2148,malignant',
  '21.69,21.14,149.9,409.8,0.1154,0.195,0.1509,0.2367,malignant',
  '15.51,27.26,109.6,237.6,0.1297,0.2072,0.1728,0.1856,malignant',
  '21.15,21.3,143.5,405.1,0.1288,0.159,0.1619,0.2127,malignant',
  '18.92,20.96,127.4,317.8,0.1376,0.2081,0.2806,0.2292,malignant',
  '18.06,23.48,120.6,287.5,0.1172,0.1954,0.2309,0.2172,malignant',
  '19.26,20.14,133.0,347.2,0.1318,0.1421,0.117,0.2212,malignant',
  '20.88,21.35,146.8,392.3,0.1269,0.1492,0.1398,0.182,malignant',
  '17.58,22.75,126.0,265.5,0.1166,0.2019,0.1389,0.2357,malignant',
  '19.7,20.44,137.6,324.9,0.13,0.2201,0.1213,0.214,malignant',
].join('\n');

const HOUSING_SAMPLE_CSV = [
  'median_income,housing_median_age,total_rooms,total_bedrooms,population,households,median_house_value',
  '6.72,11,3737,734,1475,502,386435',
  '6.35,12,822,153,326,116,384362',
  '7.31,44,2418,467,1131,376,361071',
  '7.64,20,3559,731,1443,597,446998',
  '2.59,34,1096,221,459,186,179675',
  '7.42,44,1211,289,516,187,412240',
  '6.25,14,887,195,448,141,382212',
  '8.47,34,1838,381,950,402,467506',
  '3.41,27,3574,844,1714,610,239251',
  '5.91,25,1369,284,553,177,353005',
  '7.07,13,1638,376,837,322,396015',
  '3.42,46,4289,957,1684,624,254582',
  '2.9,18,1710,384,783,266,262355',
  '8.71,35,2182,421,1199,443,441735',
  '7.62,17,1326,289,674,257,413966',
  '4.76,48,2617,554,1424,465,249824',
  '7.04,17,3492,814,1747,588,425867',
  '2.66,37,1347,279,728,237,207842',
  '9.28,21,2779,652,1456,583,500000',
  '6.49,19,2231,504,1022,343,425294',
  '8.87,48,2027,424,755,295,461245',
  '3.64,25,4296,920,1571,536,237951',
  '9.33,44,3836,719,1849,588,466703',
  '3.84,48,2433,579,1304,441,236045',
  '7.29,35,3451,756,1510,556,386040',
  '3.71,14,2084,378,960,344,245962',
  '2.35,50,941,182,500,163,153987',
  '5.76,27,3440,719,1575,539,377473',
  '3.67,40,4007,819,1478,517,258578',
  '5.06,39,4238,948,2054,645,284619',
  '2.27,31,3979,922,1591,666,222940',
  '2.88,21,1840,382,966,425,214593',
  '2.19,44,4124,746,1520,515,176162',
  '3.08,41,2671,515,1149,509,235832',
  '1.82,34,1786,421,906,365,205428',
  '2.99,28,1591,379,741,270,239084',
  '2.24,47,2652,557,1380,585,210242',
  '2.42,21,980,211,475,195,198153',
  '9.05,46,1708,367,611,268,499422',
  '4.24,26,1536,338,634,257,270034',
  '6.97,29,2572,512,1287,566,424008',
  '6.58,46,1109,204,435,176,372905',
  '8.58,25,2213,436,968,353,476011',
  '6.51,51,2866,517,1471,589,331797',
  '9.03,18,1783,333,662,240,499357',
  '3.97,23,3639,730,1774,581,311384',
  '5.56,13,1078,235,556,248,367639',
  '7.74,50,1772,336,777,267,372347',
  '2.66,19,2934,534,1244,452,251253',
  '2.78,29,2193,513,1117,365,234858',
  '3.42,25,3431,639,1736,563,272904',
  '9.3,19,4491,1059,2348,739,497006',
].join('\n');

const CREDIT_SAMPLE_CSV = [
  'person_age,person_income,person_emp_length,loan_amnt,loan_int_rate,loan_status',
  '28,21278,9,5000,9.4,0',
  '55,29395,14,3000,6.89,1',
  '53,96907,1,20000,9.08,0',
  '55,72987,8,15000,14.16,0',
  '21,117458,3,25000,11.99,0',
  '34,118072,11,3000,7.71,1',
  '43,97131,9,35000,7.06,0',
  '28,67615,3,20000,10.31,0',
  '44,93674,7,25000,7.4,0',
  '39,28458,8,35000,7.81,1',
  '44,39319,12,10000,9.22,0',
  '25,97840,6,20000,15.98,1',
  '45,53382,18,5000,15.4,0',
  '24,48021,2,35000,10.6,1',
  '34,92341,11,5000,15.02,0',
  '50,36726,9,5000,9.71,0',
  '37,115912,14,20000,11.69,0',
  '29,84784,11,3000,16.33,0',
  '30,100240,6,35000,15.35,0',
  '45,68019,15,20000,9.77,0',
  '21,107166,3,25000,18.0,0',
  '42,32621,10,15000,8.56,1',
  '37,83612,6,20000,18.36,0',
  '40,101748,17,20000,9.09,0',
  '31,88697,13,3000,14.29,0',
  '28,65576,10,5000,7.25,0',
  '26,29226,8,35000,7.4,0',
  '29,34828,11,20000,8.65,0',
  '48,45760,18,35000,15.99,1',
  '40,70296,12,15000,18.19,0',
  '36,47451,3,10000,6.77,0',
  '58,46864,1,3000,15.7,1',
  '25,22117,7,3000,13.18,1',
  '52,46080,18,5000,15.9,0',
  '57,79953,8,35000,12.65,1',
  '27,30704,9,10000,12.01,0',
  '24,106259,4,3000,11.73,0',
  '27,50591,7,5000,13.47,0',
  '32,54509,14,5000,17.87,1',
  '56,30833,2,25000,19.49,0',
  '26,116771,8,5000,11.78,0',
  '46,25685,6,15000,6.53,1',
  '50,55388,14,25000,18.95,0',
  '56,104752,16,5000,8.97,0',
  '24,93914,6,3000,16.22,1',
  '58,80493,17,35000,13.4,1',
  '53,28500,6,3000,14.24,0',
  '36,70923,4,20000,9.7,0',
  '26,72948,8,10000,18.65,1',
  '41,49285,9,15000,8.2,0',
  '50,59441,3,3000,12.46,0',
  '27,27602,9,5000,13.08,1',
].join('\n');

const CHURN_SAMPLE_CSV = [
  'customer_id,age,tenure_months,monthly_charges,total_charges,contract,tech_support,churn',
  '1001,60,8,37.0,296.0,One-Year,Yes,0',
  '1002,67,7,89.1,623.7,Two-Year,Yes,0',
  '1003,22,2,42.5,85.0,Month-to-Month,Yes,1',
  '1004,65,42,91.1,3826.2,One-Year,Yes,0',
  '1005,37,52,104.5,5434.0,Month-to-Month,No,1',
  '1006,29,14,111.6,1562.4,One-Year,Yes,1',
  '1007,26,23,102.8,2364.4,Two-Year,No,0',
  '1008,66,30,77.9,2337.0,One-Year,Yes,0',
  '1009,60,40,105.8,4232.0,One-Year,Yes,0',
  '1010,22,43,53.2,2287.6,One-Year,Yes,0',
  '1011,26,25,57.2,1430.0,Two-Year,No,1',
  '1012,42,14,88.6,1240.4,Two-Year,Yes,0',
  '1013,30,35,93.3,3265.5,Month-to-Month,No,1',
  '1014,60,45,79.6,3582.0,Two-Year,No,0',
  '1015,23,15,100.7,1510.5,One-Year,No,1',
  '1016,33,59,110.4,6513.6,Two-Year,No,1',
  '1017,51,26,105.8,2750.8,Two-Year,No,1',
  '1018,28,16,94.6,1513.6,Two-Year,No,0',
  '1019,47,58,81.7,4738.6,One-Year,Yes,0',
  '1020,28,33,74.5,2458.5,Month-to-Month,Yes,1',
  '1021,30,51,89.4,4559.4,Two-Year,Yes,0',
  '1022,58,30,77.3,2319.0,Two-Year,Yes,0',
  '1023,27,44,105.8,4655.2,One-Year,No,1',
  '1024,47,11,71.3,784.3,Two-Year,No,0',
  '1025,68,12,75.6,907.2,Month-to-Month,No,0',
  '1026,52,39,50.9,1985.1,One-Year,Yes,0',
  '1027,53,59,35.0,2065.0,One-Year,No,1',
  '1028,43,57,113.8,6486.6,One-Year,Yes,1',
  '1029,56,6,41.9,251.4,One-Year,Yes,0',
  '1030,54,50,45.1,2255.0,Two-Year,No,0',
  '1031,30,17,77.2,1312.4,Two-Year,No,0',
  '1032,54,49,93.4,4576.6,Month-to-Month,No,1',
  '1033,62,42,64.9,2725.8,Two-Year,No,1',
  '1034,34,5,62.0,310.0,Two-Year,Yes,0',
  '1035,20,5,91.6,458.0,Month-to-Month,Yes,1',
  '1036,22,56,61.4,3438.4,Two-Year,Yes,0',
  '1037,51,14,78.1,1093.4,Two-Year,No,1',
  '1038,50,52,67.6,3515.2,Month-to-Month,Yes,0',
  '1039,42,28,67.9,1901.2,Two-Year,Yes,0',
  '1040,61,7,39.8,278.6,Two-Year,No,0',
  '1041,26,16,50.3,804.8,Two-Year,No,1',
  '1042,31,18,72.0,1296.0,Month-to-Month,No,0',
  '1043,55,7,39.0,273.0,Two-Year,Yes,0',
  '1044,68,55,53.9,2964.5,One-Year,No,0',
  '1045,45,58,39.7,2302.6,One-Year,Yes,0',
  '1046,36,60,97.7,5862.0,One-Year,No,0',
  '1047,66,51,79.5,4054.5,Two-Year,No,1',
  '1048,38,14,112.5,1575.0,Two-Year,Yes,0',
  '1049,23,4,81.7,326.8,Two-Year,Yes,1',
  '1050,52,6,103.1,618.6,Month-to-Month,Yes,0',
  '1051,35,26,44.6,1159.6,Two-Year,Yes,0',
  '1052,22,40,41.6,1664.0,Two-Year,No,0',
].join('\n');

const READY_MADE_EXAMPLES: ReadyMadeExample[] = [
  {
    id: 'ex-titanic',
    name: 'Titanic Survival Benchmark',
    fileName: 'titanic_survival.csv',
    task: 'Classification',
    icon: '🚢',
    csvContent: TITANIC_SAMPLE_CSV,
  },
  {
    id: 'ex-iris',
    name: 'Iris Flower Taxonomy Benchmark',
    fileName: 'iris_species.csv',
    task: 'Classification',
    icon: '🌸',
    csvContent: IRIS_SAMPLE_CSV,
  },
  {
    id: 'ex-student',
    name: 'Student Academic Performance',
    fileName: 'student_performance.csv',
    task: 'Regression',
    icon: '🎓',
    csvContent: STUDENT_SAMPLE_CSV,
  },
  {
    id: 'ex-cancer',
    name: 'Breast Cancer Diagnostic',
    fileName: 'breast_cancer.csv',
    task: 'Classification',
    icon: '🩺',
    csvContent: CANCER_SAMPLE_CSV,
  },
  {
    id: 'ex-housing',
    name: 'California Housing Valuation',
    fileName: 'housing_prices.csv',
    task: 'Regression',
    icon: '🏠',
    csvContent: HOUSING_SAMPLE_CSV,
  },
  {
    id: 'ex-credit',
    name: 'Credit Risk & Default Assessment',
    fileName: 'credit_risk.csv',
    task: 'Classification',
    icon: '💳',
    csvContent: CREDIT_SAMPLE_CSV,
  },
  {
    id: 'ex-churn',
    name: 'Customer Churn Analysis',
    fileName: 'telecom_churn.csv',
    task: 'Classification',
    icon: '📊',
    csvContent: CHURN_SAMPLE_CSV,
  },
];

function sanitizeFileName(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-. ]/g, '').trim().replace(/ +/g, '_');
  const base = cleaned || 'experiment_1';
  return base.endsWith('.py') ? base : base + '.py';
}

function validateFileName(raw: string): string | null {
  const t = raw.trim();
  if (!t) return 'Please enter a filename.';
  if (t.length > 80) return 'Filename is too long (max 80 characters).';
  if (/[<>:"/\\|?*]/.test(t)) return 'Filename contains invalid characters.';
  return null;
}

function getStoredPreviousUploads(): PreviousUploadItem[] {
  try {
    const raw = localStorage.getItem(PREVIOUS_UPLOADS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.slice(0, MAX_PREVIOUS_UPLOADS);
      }
    }
  } catch {
    /* ignore parse errors */
  }
  return [
    {
      id: 'prev-churn-seed',
      fileName: 'telecom_churn.csv',
      uploadedAt: 'Recent',
      csvContent: CHURN_SAMPLE_CSV,
    },
    {
      id: 'prev-housing-seed',
      fileName: 'housing_prices.csv',
      uploadedAt: 'Recent',
      csvContent: HOUSING_SAMPLE_CSV,
    },
  ].slice(0, MAX_PREVIOUS_UPLOADS);
}

function saveUploadRecord(fileName: string, csvContent?: string, datasetId?: string): PreviousUploadItem[] {
  try {
    const existing = getStoredPreviousUploads();
    const filtered = existing.filter((item) => item.fileName !== fileName);
    const updated: PreviousUploadItem[] = [
      {
        id: datasetId || 'upload-' + Date.now(),
        fileName,
        uploadedAt: 'Just now',
        csvContent: csvContent ? csvContent.slice(0, 500000) : undefined,
        datasetId,
      },
      ...filtered,
    ].slice(0, MAX_PREVIOUS_UPLOADS);
    localStorage.setItem(PREVIOUS_UPLOADS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

/* ── STEP 2: Name experiment file Modal ──────────────────────────────── */
function Step2CreateFile({
  dataset,
  onBack,
  onConfirm,
}: {
  dataset: Dataset;
  onBack: () => void;
  onConfirm: (n: string, targetTab?: 'workspace' | 'code-studio') => void;
}) {
  const [fileName, setFileName] = useState('experiment_1.py');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (targetTab: 'workspace' | 'code-studio' = 'code-studio') => {
    const e = validateFileName(fileName);
    if (e) {
      setError(e);
      return;
    }
    onConfirm(sanitizeFileName(fileName), targetTab);
  };

  const rowCount = dataset.rowCount || dataset.rows.length;
  const colCount = dataset.columns.length;
  const gov = dataset.profile?.governance;
  const hasLeakage = Boolean(gov?.has_leakage && gov.leaked_features && gov.leaked_features.length > 0);
  const constantCols = gov?.constant_columns || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Dataset Overview & Live DuckDB Health Banner */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '12px 14px',
          borderRadius: 8,
          background: 'rgba(18, 14, 34, 0.75)',
          border: '1px solid ' + BB.borderLight,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: BB.success,
                boxShadow: '0 0 8px ' + BB.success,
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: BB.text,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={dataset.fileName}
            >
              {dataset.fileName}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(138, 121, 202, 0.2)',
                color: BB.primaryLight,
                fontWeight: 600,
              }}
            >
              {dataset.profile?.engine === 'duckdb' ? '⚡ DuckDB Profiler' : '⚡ Streaming Engine'}
            </span>
            <span
              style={{
                fontSize: 10,
                padding: '2px 6px',
                borderRadius: 4,
                background: 'rgba(201, 162, 75, 0.15)',
                color: BB.gold,
                fontWeight: 600,
              }}
            >
              {rowCount} rows • {colCount} cols
            </span>
          </div>
        </div>

        {/* Live Data Health & Leakage Summary Banner */}
        {hasLeakage ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#F87171',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '5px 8px',
              borderRadius: 5,
            }}
          >
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span>
              Target leakage detected in &quot;{gov?.leaked_features[0].feature}&quot; (r = {gov?.leaked_features[0].correlation.toFixed(2)})
            </span>
          </div>
        ) : constantCols.length > 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              color: '#F59E0B',
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              padding: '5px 8px',
              borderRadius: 5,
            }}
          >
            <AlertCircle style={{ width: 13, height: 13, flexShrink: 0 }} />
            <span>
              Constant column detected: {constantCols.join(', ')} (zero variance)
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: BB.success }}>
            <span style={{ fontSize: 12 }}>✓</span>
            <span>Dataset schema introspected • Zero critical leakage anomalies detected</span>
          </div>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: BB.text, margin: '0 0 4px' }}>
          Name Experiment File
        </h2>
        <p style={{ fontSize: 12, color: BB.muted, margin: 0 }}>
          Specify your Python pipeline file to store model configurations, feature transforms, and training code.
        </p>
      </div>

      <div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <FileCode
            style={{
              position: 'absolute',
              left: 12,
              width: 15,
              height: 15,
              color: BB.primaryLight,
              pointerEvents: 'none',
            }}
          />
          <input
            autoFocus
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit('code-studio');
              if (e.key === 'Escape') onBack();
            }}
            placeholder="experiment_1.py"
            style={{
              width: '100%',
              padding: '10px 12px 10px 36px',
              borderRadius: 8,
              border: '1px solid ' + (error ? BB.error : BB.borderLight),
              background: BB.elevated,
              color: BB.text,
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        {error && <p style={{ fontSize: 11, color: BB.error, margin: '4px 0 0' }}>{error}</p>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => handleSubmit('code-studio')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '10px 14px',
              borderRadius: 6,
              border: '1px solid ' + BB.primaryLight,
              background: 'linear-gradient(135deg,rgba(138,121,202,0.25),rgba(75,59,124,0.45))',
              color: BB.text,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            <Sparkles style={{ width: 14, height: 14, color: BB.gold }} />
            Create File & Enter Studio
          </button>

          <button
            type="button"
            onClick={() => handleSubmit('workspace')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 7,
              padding: '10px 14px',
              borderRadius: 6,
              border: '1px solid ' + BB.borderLight,
              background: 'rgba(24, 19, 46, 0.7)',
              color: BB.text,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 120ms ease',
            }}
          >
            <Layers style={{ width: 14, height: 14, color: BB.primaryLight }} />
            Launch Visual Pipeline
          </button>
        </div>

        <button
          type="button"
          onClick={onBack}
          style={{
            alignSelf: 'center',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '4px 8px',
            borderRadius: 5,
            border: 'none',
            background: 'transparent',
            color: BB.muted,
            fontSize: 11.5,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft style={{ width: 12, height: 12 }} /> Choose a different dataset
        </button>
      </div>
    </div>
  );
}

/* ── MAIN GATEKEEPER COMPONENT ──────────────────────────────────────── */
export function ProjectGatekeeper({
  onNavigate,
}: {
  onNavigate?: (tab: 'workspace' | 'code-studio' | 'training-results' | 'deployments' | string) => void;
} = {}) {
  const { initializeProject, staleDatasetWarning, clearStaleDatasetWarning, isValidatingDataset } = useProject();
  const [pendingDataset, setPendingDataset] = useState<Dataset | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previousUploads, setPreviousUploads] = useState<PreviousUploadItem[]>(() => getStoredPreviousUploads());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync server registered datasets if backend is running (strictly capped at 5)
  useEffect(() => {
    apiClient
      .get<{ datasets?: Array<{ id: string; name: string; original_filename?: string; created_at?: string }> }>('/datasets')
      .then((res) => {
        if (res?.datasets && Array.isArray(res.datasets) && res.datasets.length > 0) {
          setPreviousUploads((prev) => {
            const names = new Set(prev.map((p) => p.fileName));
            const serverItems: PreviousUploadItem[] = res.datasets!
              .filter((ds) => !names.has(ds.name) && !names.has(ds.original_filename || ''))
              .map((ds) => ({
                id: ds.id,
                fileName: ds.original_filename || ds.name,
                uploadedAt: ds.created_at ? new Date(ds.created_at).toLocaleDateString() : 'Server',
                datasetId: ds.id,
              }));
            return [...prev, ...serverItems].slice(0, MAX_PREVIOUS_UPLOADS);
          });
        }
      })
      .catch(() => {
        /* Backend offline or guest mode — use local storage list */
      });
  }, []);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    const valid = validateCsvFile(file);
    if (!valid.valid) {
      setError(valid.message ?? 'Invalid CSV file format.');
      return;
    }

    try {
      setIsProcessing(true);
      setProgress(25);
      const dataset = await parseCsvFile(file);
      setProgress(50);

      let datasetId: string | null = null;
      let serverProfile: DatasetProfile | null = null;
      let serverRowCount: number | undefined = undefined;
      let serverColumns: string[] | undefined = undefined;
      try {
        const fd = new FormData();
        fd.append('file', file);
        const r = await apiClient.upload<{ dataset_id: string; row_count?: number; columns?: string[] }>('/datasets/upload', fd);
        datasetId = r.dataset_id;
        serverRowCount = r.row_count;
        serverColumns = r.columns;
        setProgress(85);
        if (datasetId) {
          serverProfile = await apiClient.get<DatasetProfile>(`/datasets/${datasetId}/profile`).catch(() => null);
        }
      } catch {
        // Attempt quick auto-auth retry
        try {
          const authBody = new URLSearchParams({
            username: 'demo@ml-playground.internal',
            password: 'DemoPassword123!',
          });
          const loginRes = await fetch('/api/v1/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: authBody.toString(),
          });
          if (loginRes.ok) {
            const authData = await loginRes.json();
            if (authData.access_token) {
              localStorage.setItem('access_token', authData.access_token);
              const fd2 = new FormData();
              fd2.append('file', file);
              const r2 = await apiClient.upload<{ dataset_id: string; row_count?: number; columns?: string[] }>('/datasets/upload', fd2);
              datasetId = r2.dataset_id;
              serverRowCount = r2.row_count;
              serverColumns = r2.columns;
              setProgress(85);
              if (datasetId) {
                serverProfile = await apiClient.get<DatasetProfile>(`/datasets/${datasetId}/profile`).catch(() => null);
              }
            }
          }
        } catch {
          /* ignore auth retry failure */
        }
      }

      // Read small text cache for instant re-use
      let rawText: string | undefined = undefined;
      try {
        if (file.size < 500000) {
          rawText = await file.text();
        }
      } catch {
        /* ignore text read failure */
      }

      // Save to previous uploads list (dynamically prepends new upload, strictly caps at 5)
      const updated = saveUploadRecord(file.name, rawText, datasetId || undefined);
      if (updated.length > 0) {
        setPreviousUploads(updated.slice(0, MAX_PREVIOUS_UPLOADS));
      }

      const clientProfile = computeClientProfile(dataset);
      const resolvedProfile = serverProfile || clientProfile;
      const finalRowCount = serverProfile?.row_count ?? serverRowCount ?? resolvedProfile.row_count ?? dataset.rows.length;
      const finalCols = serverColumns && serverColumns.length > 0 ? serverColumns : dataset.columns;

      setProgress(100);
      setPendingDataset({
        ...dataset,
        columns: finalCols,
        datasetId: datasetId || 'local-' + Date.now(),
        rowCount: finalRowCount,
        profile: {
          ...resolvedProfile,
          row_count: finalRowCount,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse the CSV file.');
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProgress(0), 400);
    }
  }, []);

  const handleSelectPreviousUpload = async (item: PreviousUploadItem) => {
    if (item.csvContent) {
      const file = new File([new Blob([item.csvContent], { type: 'text/csv' })], item.fileName, { type: 'text/csv' });
      await processFile(file);
    } else if (item.datasetId) {
      try {
        setIsProcessing(true);
        const profile = await apiClient.get<DatasetProfile>(`/datasets/${item.datasetId}/profile`).catch(() => null);
        const cols = profile?.columns?.map((c) => c.name) || ['feature_1', 'feature_2', 'target'];
        setPendingDataset({
          fileName: item.fileName,
          datasetId: item.datasetId,
          rows: [],
          columns: cols,
          rowCount: profile?.row_count || 100,
          profile: profile || undefined,
        });
      } catch (err: any) {
        setError(err?.message || 'Could not load dataset from server.');
      } finally {
        setIsProcessing(false);
      }
    } else {
      setError('Cached content unavailable. Please re-upload this CSV file.');
    }
  };

  const handleSelectExample = async (ex: ReadyMadeExample) => {
    const file = new File([new Blob([ex.csvContent], { type: 'text/csv' })], ex.fileName, { type: 'text/csv' });
    await processFile(file);
  };

  return (
    <div
      role="region"
      aria-label="Project Setup"
      style={{
        height: '100%',
        maxHeight: '100%',
        width: '100%',
        background: 'radial-gradient(ellipse at 50% 10%, rgba(75,59,124,0.18) 0%, #08070F 70%)',
        padding: '20px 32px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden', // STRICT: No scroll down on gatekeeper page
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          width: '100%',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          gap: 16,
          boxSizing: 'border-box',
        }}
      >
        {/* Header Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h1
              style={{
                fontSize: 19,
                fontWeight: 800,
                color: BB.text,
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              ML Playground
            </h1>
            <p style={{ fontSize: 12, color: BB.muted, margin: '2px 0 0' }}>
              Upload your dataset or choose a ready-made example to start building, training, and benchmarking ML models.
            </p>
          </div>
        </div>

        {/* Alerts & Verification Banner */}
        {staleDatasetWarning && (
          <div
            data-testid="stale-dataset-banner"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
              padding: '8px 12px',
              borderRadius: 6,
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#FF6B6B',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
              <span>{staleDatasetWarning}</span>
            </div>
            <button
              onClick={clearStaleDatasetWarning}
              style={{
                background: 'none',
                border: 'none',
                color: '#FF6B6B',
                cursor: 'pointer',
                padding: 2,
              }}
              aria-label="Dismiss warning"
            >
              <X style={{ width: 13, height: 13 }} />
            </button>
          </div>
        )}

        {isValidatingDataset && (
          <div
            data-testid="dataset-validating-spinner"
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '10px 14px',
              color: BB.muted,
              fontSize: 12,
              background: 'rgba(24, 19, 46, 0.4)',
              borderRadius: 6,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                border: '2px solid rgba(138, 121, 202, 0.2)',
                borderTopColor: BB.primaryLight,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span>Verifying dataset on server...</span>
          </div>
        )}

        {/* ── TOP UPLOAD DATASET STRIP (Clean open layout, not inside nested block) ── */}
        <div style={{ flexShrink: 0 }}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setIsDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) processFile(f);
            }}
            onClick={() => !isProcessing && fileInputRef.current?.click()}
            style={{
              border: '1.5px dashed ' + (isDragOver ? BB.primaryLight : 'rgba(138, 121, 202, 0.28)'),
              borderRadius: 10,
              padding: '14px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              background: isDragOver ? 'rgba(138, 121, 202, 0.08)' : 'rgba(24, 19, 46, 0.35)',
              cursor: isProcessing ? 'wait' : 'pointer',
              transition: 'all 150ms ease',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {progress > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: 3,
                  width: progress + '%',
                  background: 'linear-gradient(90deg,' + BB.primaryLight + ',' + BB.gold + ')',
                  transition: 'width 250ms ease',
                }}
              />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(138, 121, 202, 0.15)',
                  border: '1px solid ' + BB.borderLight,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Upload style={{ width: 18, height: 18, color: isProcessing ? BB.gold : BB.primaryLight }} />
              </div>
              <div>
                <h2
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: BB.text,
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  Upload Dataset
                  <span style={{ fontSize: 11, fontWeight: 500, color: BB.muted }}>
                    (Drop your CSV file here or click to browse)
                  </span>
                </h2>
                <p style={{ fontSize: 11, color: BB.muted, margin: '2px 0 0' }}>
                  {isProcessing
                    ? `Processing CSV and generating profile (${progress}%)...`
                    : 'Supported: CSV & Parquet formats up to 200 MB (10+ lakhs / 1M+ rows) with header row'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span
                style={{
                  padding: '6px 16px',
                  borderRadius: 6,
                  background: 'rgba(138, 121, 202, 0.18)',
                  border: '1px solid ' + BB.primaryLight,
                  color: BB.text,
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: '0.01em',
                }}
              >
                Browse CSV File
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processFile(f);
                e.target.value = '';
              }}
            />
          </div>

          {error && (
            <div
              style={{
                marginTop: 8,
                padding: '6px 12px',
                borderRadius: 6,
                background: 'rgba(248,113,113,0.1)',
                border: '1px solid rgba(248,113,113,0.3)',
                color: BB.error,
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* ── 3 OPEN COLUMNS (No block cards, line by line, zero vertical scroll) ── */}
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 28,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* ── COLUMN 1: Previous Uploads (Strictly 5 items max, changes on new upload, NO row/col details) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 6,
                marginBottom: 8,
                borderBottom: '1px solid ' + BB.border,
                flexShrink: 0,
              }}
            >
              <Clock style={{ width: 15, height: 15, color: BB.primaryLight }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: BB.text, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Previous Uploads
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {previousUploads.length === 0 ? (
                <div style={{ padding: '12px 6px', color: BB.muted, fontSize: 12 }}>
                  No previous uploads yet.
                </div>
              ) : (
                previousUploads.slice(0, MAX_PREVIOUS_UPLOADS).map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleSelectPreviousUpload(item)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 8px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      transition: 'background 120ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(138, 121, 202, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {/* STRICT REQUIREMENT: Only filename & icon, NO row or column details */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <FileText style={{ width: 14, height: 14, color: BB.primaryLight, flexShrink: 0 }} />
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 500,
                          color: BB.text,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.fileName}
                      >
                        {item.fileName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPreviousUpload(item);
                      }}
                      style={{
                        padding: '3px 9px',
                        borderRadius: 4,
                        border: '1px solid ' + BB.borderLight,
                        background: 'rgba(138, 121, 202, 0.12)',
                        color: BB.text,
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      Load
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── COLUMN 2: Learn with Ready-Made Examples (Line by line, open design) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 6,
                marginBottom: 8,
                borderBottom: '1px solid ' + BB.border,
                flexShrink: 0,
              }}
            >
              <Sparkles style={{ width: 15, height: 15, color: BB.gold }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: BB.text, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Learn with Ready-Made Examples
              </h2>
            </div>

            {/* Scrollable list: strictly 4 visible at once, rest scrollable, zero visible scrollbars */}
            <style>{`
              .no-scrollbar::-webkit-scrollbar {
                display: none !important;
                width: 0px !important;
                height: 0px !important;
              }
              .no-scrollbar {
                -ms-overflow-style: none !important;
                scrollbar-width: none !important;
              }
            `}</style>
            <div
              className="no-scrollbar"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                maxHeight: 202, // Exactly 4 items visible
                overflowY: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              {READY_MADE_EXAMPLES.map((ex) => (
                <div
                  key={ex.id}
                  onClick={() => handleSelectExample(ex)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'background 120ms ease',
                    height: 46,
                    boxSizing: 'border-box',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(138, 121, 202, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 13, flexShrink: 0 }}>{ex.icon}</span>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 500,
                          color: BB.text,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={ex.name}
                      >
                        {ex.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            padding: '0 4px',
                            borderRadius: 3,
                            background:
                              ex.task === 'Classification' ? 'rgba(138, 121, 202, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: ex.task === 'Classification' ? '#C4B5FD' : '#FCD34D',
                          }}
                        >
                          {ex.task}
                        </span>
                        <span style={{ fontSize: 10.5, color: BB.muted, fontFamily: 'var(--font-mono)' }}>
                          {ex.fileName}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectExample(ex);
                    }}
                    style={{
                      padding: '3px 9px',
                      borderRadius: 4,
                      border: '1px solid ' + BB.borderLight,
                      background: 'rgba(138, 121, 202, 0.12)',
                      color: BB.text,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    Try
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── COLUMN 3: User Guide (Direct link to comprehensive student guide in new window) ── */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                paddingBottom: 6,
                marginBottom: 8,
                borderBottom: '1px solid ' + BB.border,
                flexShrink: 0,
              }}
            >
              <BookOpen style={{ width: 15, height: 15, color: BB.primaryLight }} />
              <h2 style={{ fontSize: 13, fontWeight: 700, color: BB.text, margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                User Guide
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0 }}>
              <p style={{ fontSize: 12, color: BB.textSecondary, margin: 0, lineHeight: 1.45 }}>
                New to ML Playground? Open our comprehensive interactive user guide to learn how each page works from data profiling to code writing, training, and production deployment.
              </p>

              <div>
                <button
                  type="button"
                  data-testid="gatekeeper-open-guide-btn"
                  onClick={() => window.open(`${window.location.origin}${window.location.pathname}#guide`, '_blank')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'transparent',
                    border: 'none',
                    padding: '2px 0',
                    color: '#A78BFA',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#C4B5FD';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = '#A78BFA';
                  }}
                >
                  <BookOpen style={{ width: 14, height: 14, color: BB.gold }} />
                  <span style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>Open User Guide</span>
                  <span style={{ fontSize: 11, opacity: 0.85 }}>↗</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── STEP 2 MODAL: Name Experiment File ──────────────────────── */}
      {pendingDataset && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'rgba(18, 14, 34, 0.96)',
              backdropFilter: 'blur(24px)',
              border: '1px solid ' + BB.borderLight,
              borderRadius: 14,
              padding: '24px 24px',
              boxShadow: '0 24px 80px rgba(0, 0, 0, 0.8)',
            }}
          >
            <Step2CreateFile
              dataset={pendingDataset}
              onBack={() => setPendingDataset(null)}
              onConfirm={(name, targetTab = 'code-studio') => {
                initializeProject(pendingDataset, name);
                if (onNavigate) {
                  onNavigate(targetTab);
                } else if (typeof window !== 'undefined') {
                  window.location.hash = targetTab === 'code-studio' ? '#code-studio' : '';
                }
              }}
            />
          </div>
        </div>
      )}
    </div >
  );
}
