import { type AppType } from 'next/dist/shared/lib/utils';
import '~/styles/globals.css';

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <div className="min-h-screen w-full bg-black text-[#39ff14]">
      <Component {...pageProps} />
    </div>
  );
};

export default MyApp;
