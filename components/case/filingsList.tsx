import { Filing } from "./caseView"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const FilingsList = ({filings}: {filings: Filing[]}) => {
  return (
    <div className="px-2">
        <h1 className="font-semibold text-lg my-2 ms-2">Filing Details</h1>
        <Table>
        <TableCaption>A list of your recent filings.</TableCaption>
        <TableHeader>
            <TableRow>
            <TableHead className="w-[100px]">SRL No.</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Filing Detail</TableHead>
            </TableRow>
        </TableHeader>
        <TableBody>
            {filings.map((filing, index) => (
                <TableRow key={index}>
                    <TableCell className="py-3">{index + 1}</TableCell>
                    <TableCell className="py-3">{filing.date}</TableCell>
                    <TableCell className="py-3 w-full break-words whitespace-pre-wrap">{filing.filingDetails}</TableCell>
                </TableRow>
            ))}
        </TableBody>
        </Table>
    </div>
  )
}
export default FilingsList