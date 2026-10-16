export interface BranchSummary {
  id: string;
  name: string;
  address: string;
  openingHours: string;
  contactNumber: string;
  availableStations: number;
  totalStations: number;
  rates: {
    label: string;
    price: number;
    unit: string;
  }[];
  promos: string[];
  rules: string[];
}
