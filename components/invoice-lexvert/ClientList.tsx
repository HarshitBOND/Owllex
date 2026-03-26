import { Client } from '@/components/types/invoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Search, Mail, Phone, Building2, TrendingUp, TrendingDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

interface ClientListProps {
  clients: Client[];
  onSelectClient: (client: Client) => void;
  selectedClientId?: string;
}

export function ClientList({ clients, onSelectClient, selectedClientId }: ClientListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="space-y-2 sm:space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 sm:left-3 top-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8 sm:pl-9 h-8 sm:h-10 text-xs sm:text-sm"
        />
      </div>

      {/* Client Cards */}
      <div className="space-y-2 sm:space-y-3">
        {filteredClients.length === 0 ? (
          <div className="text-center py-6 sm:py-8 font-outfit">
            <p className="text-muted-foreground text-sm">No clients found</p>
          </div>
        ) : (
          filteredClients.map((client) => (
            <div
              key={client.id}
              onClick={() => onSelectClient(client)}
              className={cn(
                'group relative rounded-lg sm:rounded-xl border p-2.5 sm:p-4 cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5',
                'animate-fade-in',
                selectedClientId === client.id
                  ? 'border-primary bg-primary/5 shadow-md'
                  : 'bg-card hover:border-primary/30'
              )}
            >
              <div className="flex items-start gap-2.5 sm:gap-4">
                <Avatar className="h-9 w-9 sm:h-12 sm:w-12 border-2 border-background shadow-sm shrink-0">
                  <AvatarImage src={client.avatar} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs sm:text-sm">
                    {getInitials(client.name)}
                  </AvatarFallback>
                </Avatar>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm sm:text-base truncate">{client.name}</h3>
                      <div className="flex items-center gap-1 text-xs sm:text-sm text-muted-foreground">
                        <Building2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                        <span className="truncate">{client.company}</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5">
                      {client.invoiceCount}
                    </Badge>
                  </div>

                  <div className="mt-2 sm:mt-3 grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="space-y-0.5 sm:space-y-1">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Paid</p>
                      <p className="text-xs sm:text-sm font-semibold text-emerald-600 flex items-center gap-0.5 sm:gap-1">
                        <TrendingUp className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                        {formatCurrency(client.totalPaid)}
                      </p>
                    </div>
                    <div className="space-y-0.5 sm:space-y-1">
                      <p className="text-[10px] sm:text-xs text-muted-foreground">Due</p>
                      <p className={cn(
                        'text-xs sm:text-sm font-semibold flex items-center gap-0.5 sm:gap-1',
                        client.totalOutstanding > 0 ? 'text-amber-600' : 'text-muted-foreground'
                      )}>
                        {client.totalOutstanding > 0 && <TrendingDown className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
                        {formatCurrency(client.totalOutstanding)}
                      </p>
                    </div>
                  </div>

                  {client.lastPayment && (
                    <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-muted-foreground">
                      Last: {format(client.lastPayment, 'MMM dd, yyyy')}
                    </p>
                  )}
                </div>
              </div>

              {/* Contact buttons on hover - desktop only */}
              <div className="hidden sm:flex absolute right-2 top-2 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.location.href = `mailto:${client.email}`}>
                  <Mail className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => window.location.href = `tel:${client.phone}`}>
                  <Phone className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
