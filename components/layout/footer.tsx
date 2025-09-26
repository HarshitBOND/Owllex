import { Scale } from "lucide-react"

export function Footer() {
  return (
    <footer className="bg-muted/30 border-t px-6">
      <div className="container py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <span className="font-serif text-xl font-bold text-primary">
                <img src="/logo.png" width={140} alt="" />
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              Your complete legal ecosystem. Revolutionizing how you handle legal work with cutting-edge technology.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Services</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Document Generation
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Legal Consultation
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Case Tracking
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Doorstep Delivery
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  About Us
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Careers
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Press
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Contact
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold text-foreground mb-4">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Privacy Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Cookie Policy
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Compliance
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-8 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-sm text-muted-foreground">© 2024 lexvert. All rights reserved.</p>
          <div className="flex items-center space-x-4 mt-4 sm:mt-0">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Trusted Legal Technology</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
