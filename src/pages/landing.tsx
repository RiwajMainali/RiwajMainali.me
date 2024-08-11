import Head from 'next/head';
import { Children } from 'react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
export default function Landing() {
  return (
    <div>
      <div className="flex-col p-8">
        <div>
          <text
            className="3xl:text-9xl
            pb-6
            text-4xl
            font-semibold
            sm:text-4xl
            md:text-6xl
            lg:text-7xl
            xl:text-7xl 2xl:text-8xl"
          >
            Riwaj Mainali
          </text>
        </div>
        <div>
          <text
            className="3xl:text-5xl pl-2 text-xl font-semibold sm:text-2xl md:text-2xl lg:text-3xl 2xl:text-3xl
              "
          >
            <div className="flex flex-col">
              <Link href="/GameOfLife">Game of Life.</Link>
              <Link href="/aboutMe">About me</Link>
            </div>
          </text>
        </div>
      </div>
    </div>
  );
}
