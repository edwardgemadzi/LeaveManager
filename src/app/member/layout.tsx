import MobileBottomNav from '@/components/shared/MobileBottomNav';

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="pb-20 lg:pb-0">{children}</div>
      <MobileBottomNav />
    </>
  );
}
