export type BareAct = {
  _id: string
  actName: string
  actYear?: string
  actNo?: string
  category: string
  url?: string
}

export const ACTS_DATASET: BareAct[] = [
  { _id: "ipc-1860", actName: "Indian Penal Code", actYear: "1860", actNo: "45", category: "Criminal", url: "https://www.indiacode.nic.in/handle/123456789/2263" },
  { _id: "crpc-1973", actName: "Code of Criminal Procedure", actYear: "1973", actNo: "2", category: "Criminal", url: "https://www.indiacode.nic.in/handle/123456789/1616" },
  { _id: "cpc-1908", actName: "Code of Civil Procedure", actYear: "1908", actNo: "5", category: "Civil", url: "https://www.indiacode.nic.in/handle/123456789/2195" },
  { _id: "evidence-1872", actName: "Indian Evidence Act", actYear: "1872", actNo: "1", category: "Evidence", url: "https://www.indiacode.nic.in/handle/123456789/2295" },
  { _id: "constitution-1950", actName: "Constitution of India", actYear: "1950", category: "Constitution", url: "https://www.indiacode.nic.in/handle/123456789/15258" },
  { _id: "contract-1872", actName: "Indian Contract Act", actYear: "1872", actNo: "9", category: "Commercial", url: "https://www.indiacode.nic.in/handle/123456789/2187" },
  { _id: "specific-relief-1963", actName: "Specific Relief Act", actYear: "1963", actNo: "47", category: "Civil", url: "https://www.indiacode.nic.in/handle/123456789/1592" },
  { _id: "transfer-property-1882", actName: "Transfer of Property Act", actYear: "1882", actNo: "4", category: "Property", url: "https://www.indiacode.nic.in/handle/123456789/2323" },
  { _id: "easements-1882", actName: "Indian Easements Act", actYear: "1882", actNo: "5", category: "Property", url: "https://www.indiacode.nic.in/handle/123456789/2301" },
  { _id: "registration-1908", actName: "Registration Act", actYear: "1908", actNo: "16", category: "Property", url: "https://www.indiacode.nic.in/handle/123456789/2234" },
  { _id: "limitation-1963", actName: "Limitation Act", actYear: "1963", actNo: "36", category: "Civil", url: "https://www.indiacode.nic.in/handle/123456789/1589" },
  { _id: "arbitration-1996", actName: "Arbitration and Conciliation Act", actYear: "1996", actNo: "26", category: "Commercial", url: "https://www.indiacode.nic.in/handle/123456789/1978" },
  { _id: "companies-2013", actName: "Companies Act", actYear: "2013", actNo: "18", category: "Corporate", url: "https://www.indiacode.nic.in/handle/123456789/2114" },
  { _id: "llp-2008", actName: "Limited Liability Partnership Act", actYear: "2008", actNo: "6", category: "Corporate", url: "https://www.indiacode.nic.in/handle/123456789/2053" },
  { _id: "partnership-1932", actName: "Indian Partnership Act", actYear: "1932", actNo: "9", category: "Commercial", url: "https://www.indiacode.nic.in/handle/123456789/2214" },
  { _id: "negotiable-1881", actName: "Negotiable Instruments Act", actYear: "1881", actNo: "26", category: "Commercial", url: "https://www.indiacode.nic.in/handle/123456789/2316" },
  { _id: "consumer-2019", actName: "Consumer Protection Act", actYear: "2019", actNo: "35", category: "Consumer", url: "https://www.indiacode.nic.in/handle/123456789/15284" },
  { _id: "it-2000", actName: "Information Technology Act", actYear: "2000", actNo: "21", category: "Technology", url: "https://www.indiacode.nic.in/handle/123456789/1999" },
  { _id: "copyright-1957", actName: "Copyright Act", actYear: "1957", actNo: "14", category: "IP", url: "https://www.indiacode.nic.in/handle/123456789/1557" },
  { _id: "patents-1970", actName: "Patents Act", actYear: "1970", actNo: "39", category: "IP", url: "https://www.indiacode.nic.in/handle/123456789/1652" },
  { _id: "trademarks-1999", actName: "Trade Marks Act", actYear: "1999", actNo: "47", category: "IP", url: "https://www.indiacode.nic.in/handle/123456789/2004" },
  { _id: "designs-2000", actName: "Designs Act", actYear: "2000", actNo: "16", category: "IP", url: "https://www.indiacode.nic.in/handle/123456789/1997" },
  { _id: "gst-2017", actName: "Central Goods and Services Tax Act", actYear: "2017", actNo: "12", category: "Tax", url: "https://www.indiacode.nic.in/handle/123456789/15235" },
  { _id: "income-tax-1961", actName: "Income-tax Act", actYear: "1961", actNo: "43", category: "Tax", url: "https://www.indiacode.nic.in/handle/123456789/2465" },
  { _id: "mva-1988", actName: "Motor Vehicles Act", actYear: "1988", actNo: "59", category: "Transport", url: "https://www.indiacode.nic.in/handle/123456789/1816" },
  { _id: "labour-code-wages-2019", actName: "Code on Wages", actYear: "2019", actNo: "29", category: "Labour", url: "https://www.indiacode.nic.in/handle/123456789/15332" },
  { _id: "labour-code-social-2020", actName: "Code on Social Security", actYear: "2020", actNo: "36", category: "Labour", url: "https://www.indiacode.nic.in/handle/123456789/2260" },
  { _id: "labour-code-oshs-2020", actName: "Occupational Safety, Health and Working Conditions Code", actYear: "2020", actNo: "37", category: "Labour", url: "https://www.indiacode.nic.in/handle/123456789/2264" },
  { _id: "labour-code-industrial-2020", actName: "Industrial Relations Code", actYear: "2020", actNo: "35", category: "Labour", url: "https://www.indiacode.nic.in/handle/123456789/2259" },
  { _id: "family-hma-1955", actName: "Hindu Marriage Act", actYear: "1955", actNo: "25", category: "Family", url: "https://www.indiacode.nic.in/handle/123456789/1549" },
  { _id: "family-hsa-1956", actName: "Hindu Succession Act", actYear: "1956", actNo: "30", category: "Family", url: "https://www.indiacode.nic.in/handle/123456789/1550" },
  { _id: "special-marriage-1954", actName: "Special Marriage Act", actYear: "1954", actNo: "43", category: "Family", url: "https://www.indiacode.nic.in/handle/123456789/1548" },
  { _id: "domestic-violence-2005", actName: "Protection of Women from Domestic Violence Act", actYear: "2005", actNo: "43", category: "Family", url: "https://www.indiacode.nic.in/handle/123456789/2033" },
  { _id: "rti-2005", actName: "Right to Information Act", actYear: "2005", actNo: "22", category: "Public Law", url: "https://www.indiacode.nic.in/handle/123456789/2036" },
  { _id: "administrative-tribunal-1985", actName: "Administrative Tribunals Act", actYear: "1985", actNo: "13", category: "Public Law", url: "https://www.indiacode.nic.in/handle/123456789/1769" },
  { _id: "nclt-ibc-2016", actName: "Insolvency and Bankruptcy Code", actYear: "2016", actNo: "31", category: "Commercial", url: "https://www.indiacode.nic.in/handle/123456789/15257" },
  { _id: "sarfaesi-2002", actName: "SARFAESI Act", actYear: "2002", actNo: "54", category: "Banking", url: "https://www.indiacode.nic.in/handle/123456789/2014" },
  { _id: "rbi-1934", actName: "Reserve Bank of India Act", actYear: "1934", actNo: "2", category: "Banking", url: "https://www.indiacode.nic.in/handle/123456789/2216" },
  { _id: "banking-regulation-1949", actName: "Banking Regulation Act", actYear: "1949", actNo: "10", category: "Banking", url: "https://www.indiacode.nic.in/handle/123456789/2139" },
  { _id: "fssai-2006", actName: "Food Safety and Standards Act", actYear: "2006", actNo: "34", category: "Regulatory", url: "https://www.indiacode.nic.in/handle/123456789/2042" },
  { _id: "environment-protection-1986", actName: "Environment (Protection) Act", actYear: "1986", actNo: "29", category: "Environment", url: "https://www.indiacode.nic.in/handle/123456789/1779" },
  { _id: "air-prevention-1981", actName: "Air (Prevention and Control of Pollution) Act", actYear: "1981", actNo: "14", category: "Environment", url: "https://www.indiacode.nic.in/handle/123456789/1738" },
  { _id: "water-prevention-1974", actName: "Water (Prevention and Control of Pollution) Act", actYear: "1974", actNo: "6", category: "Environment", url: "https://www.indiacode.nic.in/handle/123456789/1618" }
]
