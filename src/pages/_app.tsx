import { type AppType } from 'next/dist/shared/lib/utils';
import '~/styles/globals.css';

const MyApp: AppType = ({ Component, pageProps }) => {
  const c1 = '72, 61, 139';
  const c2 = '123, 104, 238';
  const c3 = '173, 216, 230';
  const gradientStyle = {
    background: `linear-gradient(to right, rgb(${c1}),rgba(${c2},0.6), rgb(${c3}))`,
  };
  return (
    <div className="min-h-screen w-full" style={gradientStyle}>
      <Component {...pageProps} />
    </div>
  );
};

export default MyApp;
