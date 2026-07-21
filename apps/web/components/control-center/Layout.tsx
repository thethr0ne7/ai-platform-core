import Sidebar from './Sidebar';
import Header from './Header';

export default function Layout({children}:{children:React.ReactNode}) {
  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1">
        <Header />
        {children}
      </main>
    </div>
  );
}
