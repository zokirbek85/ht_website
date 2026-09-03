export const COMPANY = {
  foundingYear: 2017,
  domain: "hazorasp-textil.uz",
  siteUrl: "https://hazorasp-textil.uz",
  email: "ahmadjonbotirov593@gmail.com",
  phones: ["+998 97 747 63 06"],
  address: "O'zbekiston, Xorazm viloyati, Hazorasp tumani, Mustaqillik ko'chasi, 45-uy"
} as const;

export function yearsOfExperience(): number {
  return new Date().getFullYear() - COMPANY.foundingYear;
}
