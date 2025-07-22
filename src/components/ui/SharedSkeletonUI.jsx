const SharedSkeletonUI = () => {
  const lineWidhts = [
    "85%",
    "92%",
    "78%",
    "95%",
    "70%",
    "88%",
    "82%",
    "90%",
    "75%",
    "93%",
    "72%",
    "86%",
  ];

  return (
    <div className="flex-1 flex items-center justify-center h-full w-full">
      {" "}
      {/* Added h-full w-full for better standalone use */}
      <div className="flex flex-col items-center w-full max-w-4xl px-6">
        {/* Top skeleton - document header */}
        <div className="w-full mb-8 flex flex-col gap-4">
          <div className="h-8 bg-stone-200 rounded-md w-3/4 animate-pulse duration-1000"></div>
          <div className="h-4 bg-stone-200 rounded-md w-1/2 animate-pulse duration-1000"></div>
        </div>

        {/* Document skeleton lines - more lines for better representation */}
        <div className="w-full flex flex-col gap-3">
          {lineWidhts.map((width, i) => (
            <div
              key={i}
              className="h-4 bg-stone-200 rounded-md animate-pulse duration-1000"
              style={{ width: width }}
            ></div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SharedSkeletonUI;
