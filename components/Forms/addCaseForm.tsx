"use client"

import ComboBox from "../common/comboBox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "../ui/label"
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import { Loader2, Plus, Search } from "lucide-react"
import { useState } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { useRouter } from "next/navigation"
import { Case } from "@/app/case-tracking/page"
import { Checkbox } from "../ui/checkbox"

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

  const handleByCaseNumberSearch = async () => {
    setLoading(true);
    if (!caseNumber || !caseType || !forum || !caseYear) {
      setLoading(false);
      return;
    }
    const caseData = { caseNumber, caseType, forum, caseYear }
    const cases = await fetch("/api/public/cases", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(caseData),
    })
    const data = await cases.json();
    setFoundCases(parseCases(data.cases));
    setLoading(false);
  };

  const handleByAdvocateNameSearch = async () => {
    setLoading(true);
    if (!advocateName || !forum || !caseYear) {
      setLoading(false);
      return;
    }
    const caseData = { advocateName, forum, caseYear }
    const cases = await fetch("/api/public/cases", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(caseData),
    })
    const data = await cases.json();
    setFoundCases(parseCases(data.cases));
    setLoading(false);
  };

  return (
    <>
    <div className="flex flex-col gap-y-4 bg-background px-4 py-8 rounded-md shadow-sm">
      <div className="flex items-center gap-x-4">
        <h1>Case Forum</h1>
        <ComboBox dropdownItems={forumList} type="forum" value={forum} setValue={setForum} />
      </div>

      <div className="mt-4">
        <Tabs defaultValue="caseNumber" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger className="py-5 font-semibold cursor-pointer" value="caseNumber">By Case Number</TabsTrigger>
            <TabsTrigger className="py-5 font-semibold cursor-pointer" value="advocateName">By Advocate Name</TabsTrigger>
          </TabsList>
          <TabsContent value="caseNumber">
            <div className="mt-6 flex flex-col items-center">
              <div className="flex gap-x-4 w-full">
                <div className="flex flex-col gap-y-2 w-1/3">
                  <Label>Case Type</Label>
                  <ComboBox className="w-full" dropdownItems={caseTypeList} type="case Type" value={caseType} setValue={setCaseType} />
                </div>
                <div className="flex flex-col gap-y-2 w-1/3">
                  <Label>Case Number</Label>
                  <Input placeholder="Enter Case Number" className="bg-background border border-gray-200" value={caseNumber} onChange={(e) => setCaseNumber(e.target.value)} />
                </div>
                <div className="flex flex-col gap-y-2 w-1/3">
                  <Label>Case Year</Label>
                  <ComboBox className="w-full" dropdownItems={caseYearList} type="case Year" value={caseYear} setValue={setCaseYear} />
                </div>
              </div>

              <Button onClick={handleByCaseNumberSearch} className="mt-8" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search />}
                {loading ? "Searching..." : foundCases.length === 0 ? "Search For Case" : "Search Other Case"}
              </Button>
            </div>
          </TabsContent>
          <TabsContent value="advocateName">
            <div className="mt-6 flex flex-col items-center">
              <div className="flex gap-x-4 w-full">
                <div className="flex flex-col gap-y-2 w-1/2">
                  <Label>Advocate Name</Label>
                  <Input placeholder="Enter Advocate Name" className="bg-background border border-gray-200" value={advocateName} onChange={(e) => setAdvocateName(e.target.value)} />
                </div>
                <div className="flex flex-col gap-y-2 w-1/2">
                  <Label>Case Year</Label>
                  <ComboBox className="w-full" dropdownItems={caseYearList} type="case Year" value={caseYear} setValue={setCaseYear} />
                </div>
              </div>

              <Button onClick={handleByAdvocateNameSearch} className="mt-8" disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search />}
                {loading ? "Searching..." : foundCases.length === 0 ? "Search For Case" : "Search Other Case"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

    </div>

    <div className="mt-6">
      <h1 className="text-lg font-semibold">Found Cases</h1>
      <div>
        <Table>
          <TableBody>
              {foundCases.length > 0 ? foundCases.map((c: Partial<Case>) => (
              <TableRow key={c._id} className="cursor-pointer">
                  <TableCell colSpan={4} onClick={() => router.push(`/case-tracking/view/${c._id}?unregistered=true`) }>
                    <div className="flex flex-col mb-2 gap-y-1 border border-gray-200 rounded-md shadow-sm p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-x-3">
                          <Checkbox className="border border-gray-200 bg-gray-50 cursor-pointer" />
                          <h2 className="text-lg font-semibold">{c.caseTitle}</h2>
                        </div>
                        <Button disabled={addingCase} onClick={(e) => {
                          e.stopPropagation();
                          setAddingCase(true);
                          router.push(`/case-tracking/add/${c._id}`);
                        }} variant="primary">
                          {addingCase ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus />}
                          {addingCase ? "Adding" : "Add Case"}
                        </Button>
                      </div>

                      <hr className="my-2" />

                      <div className="flex items-center justify-between my-6 w-full">
                        <div>
                          <p>Delhi High Court</p>
                          <p>{c.caseNo}</p>
                          <p className="text-muted-foreground w-full break-words whitespace-normal mt-2">{c.advocate}</p>
                        </div>
                      </div>

                      <hr className="my-2" />

                      <div className="flex items-center gap-x-35">
                        <div className="flex gap-x-6">
                          <div className="text-muted-foreground">
                            <p>Court Jurisdiction</p>
                            <p>(State)</p>
                          </div>
                          <p className="text-black">Delhi</p>
                        </div>

                        <div className="flex gap-x-6">
                          <div className="text-muted-foreground">
                            <p>Court Jurisdiction</p>
                            <p>(District)</p>
                          </div>
                          <p className="text-black">Delhi</p>
                        </div>

                      </div>
                    </div>
                  </TableCell>
              </TableRow>
              )) : (
                  <TableRow>
                      <TableCell colSpan={4} className="h-24 text-center">
                          No cases found
                      </TableCell>
                  </TableRow>
              )}
          </TableBody>
        </Table>
      </div>
      {foundCases.length > 25 && (
        <>
        <hr className="my-2" />
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious href="#" />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#" isActive>2</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink href="#">3</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
            <PaginationItem>
              <PaginationNext href="#" />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
        </>
      )}
    </div>
    </>
  )
}
export default AddCaseForm