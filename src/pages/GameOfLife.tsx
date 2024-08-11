import React, { useEffect, useState } from 'react';
import { set } from 'zod';

export default function GameOfLife() {
  const [grid, setGrid] = useState<number[][]>([[]]);
  const [isDragging, setIsDragging] = useState(false);
  const [size, setSize] = useState(10);
  useEffect(() => {
    setGrid(
      Array(size)
        .fill(0)
        .map(() => Array(2 * size).fill(0))
    );
  }, []);

  return (
    <>
      <div className="p-4 font-semibold">
        <text className="text-4xl">The Game of Life</text>

        <text className="text-2xl">Select the Size</text>

        <input
          type="number"
          min="1"
          max="100"
          defaultValue={size}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid black',
          }}
          onChange={(e) => {
            setSize(parseInt(e.target.value));
            setGrid(
              Array(size)
                .fill(0)
                .map(() => Array(2 * size).fill(0))
            );
          }}
        />
        <button
          className="m-2 p-2"
          onClick={() => {
            setGrid(
              Array(size)
                .fill(0)
                .map(() => Array(2 * size).fill(0))
            );
          }}
        >
          {' '}
          Clear{' '}
        </button>

        {grid.map((row, i) => (
          <div key={i} className="flex" draggable="false">
            {row.map((cell, j) => (
              <div
                draggable="false"
                key={j}
                style={{
                  backgroundColor: cell ? 'black' : 'white',
                }}
                className="h-4 w-4 border"
                onClick={() => {
                  const newGrid = JSON.parse(JSON.stringify(grid));
                  newGrid[i][j] = newGrid[i][j] ? 0 : 1;
                  setGrid(newGrid);
                }}
                onMouseDown={() => {
                  setIsDragging(true);
                }}
                onMouseMove={() => {
                  if (isDragging) {
                    const newGrid = JSON.parse(JSON.stringify(grid));
                    newGrid[i][j] = newGrid[i][j] ? 0 : 1;
                    setGrid(newGrid);
                  }
                }}
                onMouseUp={() => {
                  setIsDragging(false);
                }}
              ></div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
