"use client"

import ComboBox from "@/components/common/comboBox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, Search } from "lucide-react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Case } from "@/app/case-tracking/page"

const forumList = [
  {
    value: "delhi-high-court",
    label: "Delhi High Court",
  },
]

const caseTypeList = [
  { value: "cs(os)", label: "CS(OS)" },
  { value: "test.cas.", label: "TEST.CAS." },
  { value: "w.p.(c)", label: "W.P.(C)" },
  { value: "appeal(arb.)", label: "APPEAL(ARB.)" },
  { value: "bail-appln", label: "BAIL APPLN." },
  { value: "cm(m)", label: "CM(M)" },
  { value: "arb.a", label: "ARB.A" },
  { value: "crl.a.", label: "CRL.A." },
  { value: "aw", label: "AW" },
  { value: "crl.l.p.", label: "CRL.L.P." },
  { value: "crl.m.c.", label: "CRL.M.C." },
  { value: "c.o.", label: "C.O." },
  { value: "crl.m.a.", label: "CRL.M.A." },
  { value: "crl.rev.p.", label: "CRL.REV.P." },
  { value: "co.appl.", label: "CO.APPL." },
  { value: "c.ref.(o)", label: "C.REF.(O)" },
  { value: "c.rule", label: "C.RULE" },
  { value: "fao", label: "FAO" },
  { value: "ca", label: "CA" },
  { value: "ex.appl.(os)", label: "EX.APPL.(OS)" },
  { value: "lpa", label: "LPA" },
  { value: "caveat(co.)", label: "CAVEAT(CO.)" },
  { value: "la.app.", label: "LA.APP." },
  { value: "ex.p.", label: "EX.P." },
  { value: "review-pet.", label: "REVIEW PET." },
  { value: "o.m.p.(comm)", label: "O.M.P. (COMM)" },
  { value: "cc(arb.)", label: "CC(ARB.)" },
  { value: "ccp(co.)", label: "CCP(CO.)" },
  { value: "ccp(o)", label: "CCP(O)" },
  { value: "efa(os)", label: "EFA(OS)" },
  { value: "rfa", label: "RFA" },
  { value: "ccp(ref)", label: "CCP(REF)" },
  { value: "rsa", label: "RSA" },
  { value: "ceac", label: "CEAC" },
  { value: "tr.p.(crl.)", label: "TR.P.(CRL.)" },
  { value: "cear", label: "CEAR" },
  { value: "o.m.p.", label: "O.M.P." },
  { value: "cf", label: "CF" },
  { value: "w.p.(crl)", label: "W.P.(CRL)" },
  { value: "chat.a.c.", label: "CHAT.A.C." },
  { value: "cont.cas(c)", label: "CONT.CAS(C)" },
  { value: "chat.a.ref", label: "CHAT.A.REF" },
  { value: "cs(comm)", label: "CS(COMM)" },
  { value: "co.pet.", label: "CO.PET." },
  { value: "omp(enf.)(comm.)", label: "OMP (ENF.) (COMM.)" },
  { value: "arb.p.", label: "ARB.P." },
  { value: "cmi", label: "CMI" },
  { value: "co.a(sb)", label: "CO.A(SB)" },
  { value: "el.pet.", label: "EL.PET." },
  { value: "co.app.", label: "CO.APP." },
  { value: "c.o.(comm.ipd-tm)", label: "C.O. (COMM.IPD-TM)" },
  { value: "c.r.p.", label: "C.R.P." },
  { value: "co.appl.(c)", label: "CO.APPL.(C)" },
  { value: "cc", label: "CC" },
  { value: "cm-appl.", label: "CM APPL." },
  { value: "co.appl.(m)", label: "CO.APPL.(M)" },
  { value: "co.ex.", label: "CO.EX." },
  { value: "cont.cas.(crl)", label: "CONT.CAS.(CRL)" },
  { value: "crl.m.(bail)", label: "CRL.M.(BAIL)" },
  { value: "fao(os)(comm)", label: "FAO(OS) (COMM)" },
  { value: "cc(comm)", label: "CC(COMM)" },
  { value: "wp(c)(ipd)", label: "WP(C)(IPD)" },
  { value: "rfa(comm)", label: "RFA(COMM)" },
  { value: "crl.c.ref.", label: "CRL.C.REF." },
  { value: "fao(comm)", label: "FAO (COMM)" },
  { value: "fao(os)", label: "FAO(OS)" },
  { value: "w.p.(c)-ipd", label: "W.P.(C)-IPD" },
  { value: "crl.m.(co.)", label: "CRL.M.(CO.)" },
  { value: "arb.a.(comm.)", label: "ARB. A. (COMM.)" },
  { value: "rfa-ipd", label: "RFA-IPD" },
  { value: "o.m.p.(misc.)(comm.)", label: "O.M.P.(MISC.)(COMM.)" },
  { value: "crl.m.i.", label: "CRL.M.I." },
  { value: "rfa(os)(comm)", label: "RFA(OS)(COMM)" },
  { value: "crl.o.", label: "CRL.O." },
  { value: "o.m.p.(i)(comm.)", label: "O.M.P.(I) (COMM.)" },
  { value: "crl.o.(co.)", label: "CRL.O.(CO.)" },
  { value: "o.m.p.(efa)(comm.)", label: "O.M.P.(EFA)(COMM.)" },
  { value: "rfa(os)", label: "RFA(OS)" },
  { value: "mac.app.", label: "MAC.APP." },
  { value: "cont.app.(c)", label: "CONT.APP.(C)" },
  { value: "o.a.", label: "O.A." },
  { value: "cs(os)-gp", label: "CS(OS) GP" },
  { value: "cus.a.c.", label: "CUS.A.C." },
  { value: "i.a.", label: "I.A." },
  { value: "cus.a.r.", label: "CUS.A.R." },
  { value: "diary-number", label: "Diary Number" },
  { value: "crl.ref.", label: "CRL.REF." },
  { value: "cusaa", label: "CUSAA" },
  { value: "custom-a.", label: "CUSTOM A." },
  { value: "death-sentence-ref.", label: "DEATH SENTENCE REF." },
  { value: "eda", label: "EDA" },
  { value: "edc", label: "EDC" },
  { value: "edr", label: "EDR" },
  { value: "etr", label: "ETR" },
  { value: "ex.f.a.", label: "EX.F.A." },
  { value: "ex.s.a.", label: "EX.S.A." },
  { value: "gcac", label: "GCAC" },
  { value: "gcar", label: "GCAR" },
  { value: "gta", label: "GTA" },
  { value: "gtc", label: "GTC" },
  { value: "gtr", label: "GTR" },
  { value: "i.p.a.", label: "I.P.A." },
  { value: "ita", label: "ITA" },
  { value: "itc", label: "ITC" },
  { value: "itr", label: "ITR" },
  { value: "itsa", label: "ITSA" },
  { value: "mat.", label: "MAT." },
  { value: "mat.app.", label: "MAT.APP." },
  { value: "mat.app.(f.c.)", label: "MAT.APP.(F.C.)" },
  { value: "mat.case", label: "MAT.CASE" },
  { value: "mat.ref.", label: "MAT.REF." },
  { value: "na", label: "NA" },
  { value: "o.m.p.(e)(comm.)", label: "O.M.P. (E) (COMM.)" },
  { value: "o.m.p.(j)(comm.)", label: "O.M.P. (J) (COMM.)" },
  { value: "o.m.p.(t)(comm.)", label: "O.M.P. (T) (COMM.)" },
  { value: "o.m.p.(e)", label: "O.M.P. (E)" },
  { value: "o.m.p.(i)", label: "O.M.P.(I)" },
  { value: "o.m.p.(t)", label: "O.M.P.(T)" },
  { value: "omp(cont.)", label: "OMP (CONT.)" },
  { value: "o.ref.", label: "O.REF." },
  { value: "obj.in-suit", label: "OBJ. IN SUIT" },
  { value: "ocja", label: "OCJA" },
  { value: "od", label: "OD" },
  { value: "olr", label: "OLR" },
  { value: "r.a.", label: "R.A." },
  { value: "rc.rev.", label: "RC.REV." },
  { value: "rc.s.a.", label: "RC.S.A." },
  { value: "sca", label: "SCA" },
  { value: "sdr", label: "SDR" },
  { value: "serta", label: "SERTA" },
  { value: "st.appl.", label: "ST.APPL." },
  { value: "st.ref.", label: "ST.REF." },
  { value: "stc", label: "STC" },
  { value: "sur.t.ref.", label: "SUR.T.REF." },
  { value: "tr.p.(c)", label: "TR.P.(C)" },
  { value: "tr.p.(c.)", label: "TR.P.(C.)" },
  { value: "vat-appeal", label: "VAT APPEAL" },
  { value: "wta", label: "WTA" },
  { value: "wtc", label: "WTC" },
  { value: "wtr", label: "WTR" },
  { value: "o.m.p.(misc.)", label: "O.M.P. (Misc.)" },
  { value: "mediation-petition-no", label: "Mediation Petition No" },
  { value: "cs-no.", label: "CS No." },
  { value: "tm-no.", label: "TM No." },
  { value: "mata-fc", label: "Mata FC" },
  { value: "b.d", label: "B.D" },
  { value: "m&c", label: "M&C" },
  { value: "fir-no.", label: "FIR No." },
  { value: "suit-no.", label: "Suit No." },
  { value: "cs-dj", label: "CS DJ" },
  { value: "pim", label: "PIM" },
  { value: "efa(os)(comm)", label: "EFA (OS) COMM" },
  { value: "cm(m)-ipd", label: "CM(M)-IPD" },
  { value: "c.a.(comm.ipd-gi)", label: "C.A.(COMM.IPD-GI)" },
  { value: "c.a.(comm.ipd-pat)", label: "C.A.(COMM.IPD-PAT)" },
  { value: "c.a.(comm.ipd-pv)", label: "C.A.(COMM.IPD-PV)" },
  { value: "c.a.(comm.ipd-tm)", label: "C.A.(COMM.IPD-TM)" },
  { value: "c.o.(comm.ipd-cr)", label: "C.O.(COMM.IPD-CR)" },
  { value: "c.o.(comm.ipd-gi)", label: "C.O.(COMM.IPD-GI)" },
  { value: "c.o.(comm.ipd-pat)", label: "C.O.(COMM.IPD-PAT)" },
  { value: "ca(comm.ipd-cr)", label: "CA (COMM.IPD-CR)" },
  { value: "crp-ipd", label: "CRP-IPD" },
  { value: "demo", label: "DEMO" },
  { value: "fao(os)(ipd)", label: "FAO(OS)(IPD)" },
  { value: "fao-ipd", label: "FAO-IPD" },
  { value: "misc.-appeal(pmla)", label: "MISC. APPEAL(PMLA)" },
  { value: "rf(os)(ipd)", label: "RF(OS)(IPD)" },
  { value: "efa(os)(ipd)", label: "EFA(OS)(IPD)" },
  { value: "cav", label: "CAV" },
  { value: "co.sec.ref", label: "CO.SEC.REF" },
  { value: "cs(comm)-infra", label: "CS(COMM) INFRA" },
  { value: "cs(os)-infra", label: "CS(OS) INFRA" },
  { value: "efa(comm)", label: "EFA(COMM)" },
  { value: "oa", label: "OA" },
  { value: "o.m.p.(comm)-infra", label: "O.M.P. (COMM) INFRA" },
  { value: "obj", label: "OBJ" },
  { value: "omp(infra)", label: "OMP (INFRA)" },
  { value: "admin.report", label: "ADMIN.REPORT" },
  { value: "rera-appeal", label: "RERA APPEAL" },
  { value: "cs(somm)", label: "CS(SOMM)" },
  { value: "crl.rev.p.(mat.)", label: "CRL.REV.P.(MAT.)" },
];

const caseYearList = [
  { value: "2026", label: "2026" },
  { value: "2025", label: "2025" },
  { value: "2024", label: "2024" },
  { value: "2023", label: "2023" },
  { value: "2022", label: "2022" },
  { value: "2021", label: "2021" },
  { value: "2020", label: "2020" },
  { value: "2019", label: "2019" },
  { value: "2018", label: "2018" },
  { value: "2017", label: "2017" },
  { value: "2016", label: "2016" },
  { value: "2015", label: "2015" },
  { value: "2014", label: "2014" },
  { value: "2013", label: "2013" },
  { value: "2012", label: "2012" },
  { value: "2011", label: "2011" },
  { value: "2010", label: "2010" },
  { value: "2009", label: "2009" },
  { value: "2008", label: "2008" },
  { value: "2007", label: "2007" },
  { value: "2006", label: "2006" },
  { value: "2005", label: "2005" },
  { value: "2004", label: "2004" },
  { value: "2003", label: "2003" },
  { value: "2002", label: "2002" },
  { value: "2001", label: "2001" },
  { value: "2000", label: "2000" },
  { value: "1999", label: "1999" },
  { value: "1998", label: "1998" },
  { value: "1997", label: "1997" },
  { value: "1996", label: "1996" },
  { value: "1995", label: "1995" },
  { value: "1994", label: "1994" },
  { value: "1993", label: "1993" },
  { value: "1992", label: "1992" },
  { value: "1991", label: "1991" },
  { value: "1990", label: "1990" },
  { value: "1989", label: "1989" },
  { value: "1988", label: "1988" },
  { value: "1987", label: "1987" },
  { value: "1986", label: "1986" },
  { value: "1985", label: "1985" },
  { value: "1984", label: "1984" },
  { value: "1983", label: "1983" },
  { value: "1982", label: "1982" },
  { value: "1981", label: "1981" },
  { value: "1980", label: "1980" },
  { value: "1979", label: "1979" },
  { value: "1978", label: "1978" },
  { value: "1977", label: "1977" },
  { value: "1976", label: "1976" },
  { value: "1975", label: "1975" },
  { value: "1974", label: "1974" },
  { value: "1973", label: "1973" },
  { value: "1972", label: "1972" },
  { value: "1971", label: "1971" },
  { value: "1970", label: "1970" },
  { value: "1969", label: "1969" },
  { value: "1968", label: "1968" },
  { value: "1967", label: "1967" },
  { value: "1966", label: "1966" },
  { value: "1965", label: "1965" },
  { value: "1964", label: "1964" },
  { value: "1963", label: "1963" },
  { value: "1962", label: "1962" },
  { value: "1961", label: "1961" },
  { value: "1960", label: "1960" },
  { value: "1959", label: "1959" },
  { value: "1958", label: "1958" },
  { value: "1957", label: "1957" },
  { value: "1956", label: "1956" },
  { value: "1955", label: "1955" },
  { value: "1954", label: "1954" },
  { value: "1953", label: "1953" },
  { value: "1952", label: "1952" },
  { value: "1951", label: "1951" },
  { value: "1950", label: "1950" },
];

export interface CaseApi {
  _id: string;
  case_no: string;
  case_title: string;
  advocate: string;
  case_stage: string;
  remarks: string;
  links: string[];
  court_name: string;
  court_value: string;
  cause_list_date: string;
  scrapped_at: Date;
}

const parseCases = (cases: CaseApi[]) => {
  return cases.map((c: CaseApi) => {
    return {
      _id: c._id,
      caseNo: c.case_no,
      caseTitle: c.case_title,
      advocate: c.advocate,
      caseStage: c.case_stage,
      remarks: c.remarks,
      links: c.links,
      courtName: c.court_name,
      courtValue: c.court_value,
      causeListDate: c.cause_list_date,
      scrappedAt: c.scrapped_at,
    }
  })
}

const AddCaseForm = () => {

  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [addingCase, setAddingCase] = useState(false);
  const [caseType, setCaseType] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [caseYear, setCaseYear] = useState("");
  const [advocateName, setAdvocateName] = useState("");
  const [forum, setForum] = useState("delhi-high-court");
  const [foundCases, setFoundCases] = useState<Partial<Case>[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleByCaseNumberSearch = async () => {
    if (!caseNumber || !caseType || !forum || !caseYear) return;
    try {
      setLoading(true);
      setSearchError(null);
      setHasSearched(true);
      const caseData = { caseNumber, caseType, forum, caseYear }
      const response = await fetch("/api/public/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(caseData),
      })
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      const data = await response.json();
      if (data.cases && Array.isArray(data.cases)) {
        setFoundCases(parseCases(data.cases));
      } else {
        setFoundCases([]);
      }
    } catch (error) {
      console.error("Case search error:", error);
      setSearchError("Failed to search cases. Please try again.");
      setFoundCases([]);
    } finally {
      setLoading(false);
    }
  };

  const handleByAdvocateNameSearch = async () => {
    if (!advocateName || !forum || !caseYear) return;
    try {
      setLoading(true);
      setSearchError(null);
      setHasSearched(true);
      const caseData = { advocateName, forum, caseYear }
      const response = await fetch("/api/public/cases", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(caseData),
      })
      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }
      const data = await response.json();
      if (data.cases && Array.isArray(data.cases)) {
        setFoundCases(parseCases(data.cases));
      } else {
        setFoundCases([]);
      }
    } catch (error) {
      console.error("Case search error:", error);
      setSearchError("Failed to search cases. Please try again.");
      setFoundCases([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Step 1: Select Forum */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary text-white flex items-center justify-center text-sm font-bold">1</div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Select Court</h2>
            <p className="text-sm text-gray-500">Choose which court the case belongs to</p>
          </div>
        </div>
        <ComboBox dropdownItems={forumList} type="forum" value={forum} setValue={setForum} />
      </div>

      {/* Step 2: Search for Case */}
      <div className="bg-white rounded-xl border-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-6 mb-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary text-white flex items-center justify-center text-sm font-bold">2</div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Find Your Case</h2>
            <p className="text-sm text-gray-500">Search by case number or advocate name</p>
          </div>
        </div>

        <Tabs defaultValue="caseNumber" className="w-full">
          <TabsList className="w-full mb-6 h-12 bg-gray-100 rounded-xl p-1">
            <TabsTrigger className="py-2.5 font-semibold cursor-pointer rounded-lg data-[state=active]:shadow-md text-sm" value="caseNumber">
              <Search className="h-4 w-4 mr-2" />
              By Case Number
            </TabsTrigger>
            <TabsTrigger className="py-2.5 font-semibold cursor-pointer rounded-lg data-[state=active]:shadow-md text-sm" value="advocateName">
              <Search className="h-4 w-4 mr-2" />
              By Advocate Name
            </TabsTrigger>
          </TabsList>

          <TabsContent value="caseNumber">
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-y-2">
                  <Label className="font-semibold text-gray-700">Case Type <span className="text-red-500">*</span></Label>
                  <ComboBox className="w-full" dropdownItems={caseTypeList} type="case Type" value={caseType} setValue={setCaseType} />
                  <p className="text-xs text-gray-400">e.g. W.P.(C), CS(OS), CRL.A.</p>
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label className="font-semibold text-gray-700">Case Number <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. 1234" className="bg-white border-2 border-gray-200 focus:border-sidebar-primary h-10" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} />
                  <p className="text-xs text-gray-400">Enter the case number only</p>
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label className="font-semibold text-gray-700">Year <span className="text-red-500">*</span></Label>
                  <ComboBox className="w-full" dropdownItems={caseYearList} type="case Year" value={caseYear} setValue={setCaseYear} />
                  <p className="text-xs text-gray-400">Year of filing</p>
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <Button onClick={handleByCaseNumberSearch} size="lg" className="px-8 h-11 text-base shadow-md min-w-[168px]" disabled={loading || !caseNumber || !caseType || !caseYear}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                  {loading ? "Searching..." : "Search Case"}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="advocateName">
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-y-2">
                  <Label className="font-semibold text-gray-700">Advocate Name <span className="text-red-500">*</span></Label>
                  <Input placeholder="e.g. Rohit Sharma" className="bg-white border-2 border-gray-200 focus:border-sidebar-primary h-10" value={advocateName} onChange={(e) => setAdvocateName(e.target.value)} />
                  <p className="text-xs text-gray-400">Full name of the advocate</p>
                </div>
                <div className="flex flex-col gap-y-2">
                  <Label className="font-semibold text-gray-700">Year <span className="text-red-500">*</span></Label>
                  <ComboBox className="w-full" dropdownItems={caseYearList} type="case Year" value={caseYear} setValue={setCaseYear} />
                  <p className="text-xs text-gray-400">Year of filing</p>
                </div>
              </div>

              <div className="flex justify-center pt-2">
                <Button onClick={handleByAdvocateNameSearch} size="lg" className="px-8 h-11 text-base shadow-md min-w-[168px]" disabled={loading || !advocateName || !caseYear}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                  {loading ? "Searching..." : "Search Cases"}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Error Display */}
      {searchError && (
        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6 text-red-700">
          <p className="font-medium">{searchError}</p>
        </div>
      )}

      {/* Step 3: Results */}
      {hasSearched && (
        <div className="bg-white rounded-xl border-2 border-gray-200 shadow-[0_2px_8px_rgba(0,0,0,0.06)] p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-full bg-sidebar-primary text-white flex items-center justify-center text-sm font-bold">3</div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {foundCases.length > 0 ? `Found ${foundCases.length} Case${foundCases.length > 1 ? 's' : ''}` : 'No Cases Found'}
              </h2>
              <p className="text-sm text-gray-500">
                {foundCases.length > 0 ? 'Click "Add Case" to add it to your portfolio' : 'Try different search terms or check the spelling'}
              </p>
            </div>
          </div>

          {foundCases.length > 0 ? (
            <div className="space-y-4">
              {foundCases.map((c: Partial<Case>) => (
                <div key={c._id} className="border-2 border-gray-200 rounded-xl p-5 hover:border-sidebar-primary/30 hover:shadow-md transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-gray-900 leading-snug">{c.caseTitle}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium">{c.caseNo}</span>
                        <span className="text-xs px-2.5 py-1 rounded-full bg-gray-50 text-gray-600 border-2 border-gray-200">Delhi High Court</span>
                      </div>
                      {c.advocate && (
                        <p className="text-sm text-gray-500 mt-2">Advocate: {c.advocate}</p>
                      )}
                    </div>
                    <Button disabled={addingCase} onClick={(e) => {
                      e.stopPropagation();
                      setAddingCase(true);
                      router.push(`/case-tracking/add/${c._id}`);
                    }} className="shrink-0 shadow-md h-10 px-5 min-w-[118px]">
                      {addingCase ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
                      {addingCase ? "Adding..." : "Add Case"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10">
              <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-base font-semibold text-gray-600">No matching cases found</p>
              <p className="text-sm text-gray-400 mt-1">Double-check the case number, type, and year</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
export default AddCaseForm