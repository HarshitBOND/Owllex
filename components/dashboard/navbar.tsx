import { UserButton } from "@clerk/nextjs"
import { Bell, Menu } from "lucide-react"

const Navbar = ({location}: {location: string}) => {
  return (
    <div className="flex flex-col w-full">
      <div className="flex items-center justify-between w-full lg:mb-6 mb-2">
          <h1 className="lg:text-2xl text-xl font-semibold hidden lg:block">{location}</h1>
          <img src="/main-logo.png" className="w-11 h-11 lg:hidden" alt="" />
          <div className="flex items-center md:gap-x-4 gap-x-2">
              <div className="relative cursor-pointer hover:bg-gray-200 md:p-2 p-1 rounded-md">
                  <Bell size={20}/>
              </div>
              <UserButton/>
              <div className="relative cursor-pointer hover:bg-gray-200 md:p-2 p-1 rounded-md lg:hidden">
                  <Menu size={24}/>
              </div>
          </div>
      </div>
      <hr className="mb-4 border-gray-200 border-1 lg:hidden"/>
    </div>
  )
}
export default Navbar