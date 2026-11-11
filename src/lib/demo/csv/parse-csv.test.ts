import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, str, reqStr, num, reqNum, bool, json } from "./parse-csv";

describe("parseCsv", () => {
  it("parses plain rows", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("handles quoted commas, escaped quotes, embedded newlines", () => {
    expect(parseCsv('a,b\n"x,y","he said ""hi"""\n"line1\nline2",z\n')).toEqual([
      ["a", "b"], ["x,y", 'he said "hi"'], ["line1\nline2", "z"],
    ]);
  });
  it("handles CRLF and trailing blank lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
  it("keeps empty cells", () => {
    expect(parseCsv("a,b,c\n1,,3\n")).toEqual([["a", "b", "c"], ["1", "", "3"]]);
  });
});

describe("parseCsvObjects", () => {
  it("maps headers to cells", () => {
    expect(parseCsvObjects("id,name\np1,Flat White\n", "products.csv")).toEqual([
      { id: "p1", name: "Flat White" },
    ]);
  });
  it("throws with file+row context on ragged rows", () => {
    expect(() => parseCsvObjects("a,b\n1\n", "products.csv")).toThrow(/products\.csv: row 2/);
  });
  it("returns [] for header-only input", () => {
    expect(parseCsvObjects("a,b\n", "x.csv")).toEqual([]);
  });
});

describe("coercion", () => {
  it("str: empty → null", () => { expect(str("")).toBeNull(); expect(str("x")).toBe("x"); });
  it("reqStr throws on empty", () => { expect(() => reqStr("", "id", "f.csv")).toThrow(/f\.csv.*id/); });
  it("num: empty → null, numeric string → number", () => {
    expect(num("")).toBeNull(); expect(num("30.6")).toBe(30.6);
    expect(() => num("abc", "price", "f.csv")).toThrow(/f\.csv.*price/);
  });
  it("reqNum throws on empty", () => { expect(() => reqNum("", "price", "f.csv")).toThrow(); });
  it("bool parses true/false", () => { expect(bool("true")).toBe(true); expect(bool("false")).toBe(false); });
  it("json: empty → null, parses arrays/objects", () => {
    expect(json("")).toBeNull();
    expect(json<number[]>("[1,2]")).toEqual([1, 2]);
  });
});