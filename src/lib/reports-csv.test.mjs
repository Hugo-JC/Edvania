import test from "node:test";
import assert from "node:assert/strict";
import {buildCsvDocument, escapeCsvCell, parseDateRangeFilters} from "./reports-csv.ts";

test("escapeCsvCell neutralizes spreadsheet formula injection and quotes delimiters", () => {
  assert.equal(escapeCsvCell("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(escapeCsvCell("+cmd|'/C calc'!A0"), "'+cmd|'/C calc'!A0");
  assert.equal(escapeCsvCell("-1+1"), "'-1+1");
  assert.equal(escapeCsvCell("@HYPERLINK"), "'@HYPERLINK");
  assert.equal(escapeCsvCell("Arroz, saco \"25kg\""), "\"Arroz, saco \"\"25kg\"\"\"");
});

test("buildCsvDocument outputs UTF-8 BOM and CRLF lines", () => {
  const doc = buildCsvDocument(["Tipo", "Valor"], [["Venda", "500.00"]]);
  assert.equal(doc, "\uFEFFTipo,Valor\r\nVenda,500.00\r\n");
});

test("parseDateRangeFilters accepts YYYY-MM-DD and discards invalid dates", () => {
  assert.deepEqual(parseDateRangeFilters("2026-11-01", "2026-11-23"), {
    fromDate: "2026-11-01",
    toDate: "2026-11-23",
    fromIso: "2026-11-01T00:00:00.000Z",
    toIso: "2026-11-23T23:59:59.999Z",
  });
  assert.deepEqual(parseDateRangeFilters("invalid", "2026/11/23"), {
    fromDate: "",
    toDate: "",
    fromIso: null,
    toIso: null,
  });
});
