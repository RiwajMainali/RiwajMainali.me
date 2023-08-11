import Head from "next/head";
import { useState, useEffect } from "react";

type color = {
  r: number;
  g: number;
  b: number;
};

export default function Home() {
  const [colors, setColors] = useState<color[]>([]);

  const analogousColor = (colorChoice: "red" | "green" | "blue") => {
    const r =
      colorChoice === "red"
        ? 180 + Math.floor(Math.random() * 80)
        : Math.floor(Math.random() * 100); // Generating lower values for lighter shades
    const g =
      colorChoice === "green"
        ? 150 + Math.floor(Math.random() * 100)
        : Math.floor(Math.random() * 100); // Generating lower values for lighter shades
    const b =
      colorChoice === "blue"
        ? 100 + Math.floor(Math.random() * 100)
        : Math.floor(Math.random() * 100); // Generating lower values for lighter shades
    return { r, g, b };
  };

  useEffect(() => {
    setColors([
      analogousColor("red"),
      analogousColor("green"),
      analogousColor("blue"),
    ]);
  }, []);
  const red = `${colors[0]?.r}, ${colors[0]?.g}, ${colors[0]?.b}`;
  const blue = `${colors[1]?.r}, ${colors[1]?.g}, ${colors[1]?.b}`;
  const green = `${colors[2]?.r}, ${colors[2]?.g}, ${colors[2]?.b}`;
  const gradientStyle = {
    background: `linear-gradient(to right, rgb(${red}),rgba(${green},0.6), rgb(${blue}))`,
  };

  console.log(colors[0]);
  return (
    <>
      <Head>
        <title>Home</title>
        <meta name="description" content="Generated by create-t3-app" />
      </Head>
      <main
        style={gradientStyle}
        className="flex min-h-screen flex-col justify-center"
      >
        <text
          className="
            p-2 text-center
            text-5xl
            font-semibold
             sm:text-4xl
             md:text-6xl
            2xl:text-8xl
             "
        >
          Riwaj Mainali
        </text>
      </main>
    </>
  );
}
