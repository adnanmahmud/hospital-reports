(function() {
  const colors = ["#119eb9", "#fc8d62", "#66c2a5", "#e78ac3", "#e5c494"];

  const tooltip = initTooltip();
  //// Process data
  Promise.all([
    d3.csv("data/MA Hospital  FY14-18 Indicators.csv"),
    d3.csv("data/MA top 15 Discharges Final.csv"),
    d3.csv("data/MA FY18 Discharges by Location.csv")
  ])
    .then(([financialData, drgData, locationData]) => {
      // All hospitals in the data
      const allHospitals = [...new Set(financialData.map(d => d.Name))];

      // Financial data
      financialData.forEach(d => (d.Value = +d.Value));
      const allYears = [
        ...new Set(financialData.map(d => d["Fiscal Year"]))
      ].sort();
      const financialDataByHospitalByIndicator = d3.group(
        financialData,
        d => d.Name,
        d => d.Indicator
      );
      for (let financialDataByIndicator of financialDataByHospitalByIndicator.values()) {
        for (let data of financialDataByIndicator.values()) {
          const baseValue = data.find(d => d["Fiscal Year"] === allYears[0])
            .Value;
          data.forEach(d => (d.Change = (d.Value - baseValue) / baseValue));
        }
      }

      $(".menu .item").tab();
      $("#target-hospital-select").dropdown({
        values: allHospitals.map(d => ({ name: d, value: d })),
        placeholder: "Select one",
        onChange: value => {
          if (!value) return;
          if (d3.select(".bottom-container").style("display") === "none") {
            d3.select(".bottom-container").style("display", "block");
          }
          updateFinancialPerformanceTab(
            value,
            financialDataByHospitalByIndicator,
            allHospitals,
            allYears
          );
          $("#target-hospital-select input").blur();
        }
      });
    })
    .catch(error => {
      console.error(error);
    });

  //// Financial performance
  function updateFinancialPerformanceTab(
    targetHospital,
    data,
    allHospitals,
    allYears
  ) {
    // Setup
    let selected = new Set();
    const allIndicators = [...data.get(targetHospital).keys()];
    let svgWidth, width;
    const svgHeight = 120;
    const margin = {
      top: 10,
      right: 50,
      bottom: 20,
      left: 50
    };
    const height = svgHeight - margin.top - margin.bottom;

    const x = d3.scalePoint().domain(allYears);
    const color = d3.scaleOrdinal().range(colors);

    // Init
    const tab = d3.select("#financial-performance");
    updateDimension();
    tab.html(`
      <div class="ui form">
        <div class="inline field">
          <label>Compare hospitals</label>
          <div class="ui search multiple selection dropdown">
            <div class="text"></div>
            <i class="dropdown icon"></i>
          </div>
        </div>
      </div>
      <div class="chart-section"></div>
    `);

    tab
      .select(".chart-section")
      .selectAll(".chart")
      .data(allIndicators)
      .join("div")
      .attr("class", "chart")
      .call(chart =>
        chart
          .append("div")
          .attr("class", "chart-title")
          .text(d => d)
      )
      .call(chart =>
        chart
          .append("svg")
          .attr("class", "chart-svg")
          .attr("width", svgWidth)
          .attr("height", svgHeight)
          .append("g")
          .attr("transform", `translate(${margin.left},${margin.top})`)
          .call(g => g.append("g").attr("class", "x axis"))
          .call(g => g.append("g").attr("class", "y axis"))
          .call(g => g.append("g").attr("class", "lines"))
          .call(g => g.append("g").attr("class", "labels"))
          .call(g => g.append("g").attr("class", "focus"))
      );

    $("#financial-performance .dropdown")
      .dropdown({
        values: allHospitals.map(d => ({ name: d, value: d })),
        maxSelections: 5,
        onAdd: value => {
          if (!selected.has(value)) {
            selected.add(value);
            updateChart();
          }
        },
        onRemove: value => {
          if (selected.has(value)) {
            selected.delete(value);
            updateChart();
          }
        }
      })
      .dropdown("set selected", targetHospital);

    // Update chart
    function updateChart() {
      let selectedYear;

      tab.selectAll(".chart-svg").each(function(indicator) {
        const lineData = [];
        for (let hospital of selected) {
          const hospitalData = data.get(hospital);
          if (hospitalData.has(indicator)) {
            lineData.push({
              key: hospital,
              value: hospitalData.get(indicator)
            });
          }
        }
        lineData.reverse();

        color.domain([...selected]);
        tab
          .selectAll(".multiple.dropdown .ui.label")
          .data(color.domain())
          .style("background", d => color(d));

        const yMin = d3.min(lineData, d => d3.min(d.value, d => d.Change));
        const yMax = d3.max(lineData, d => d3.max(d.value, d => d.Change));
        const y = d3
          .scaleLinear()
          .domain([yMin, yMax])
          .range([height, 0]);
        const line = d3
          .line()
          .x(d => x(d["Fiscal Year"]))
          .y(d => y(d.Change))
          .curve(d3.curveCatmullRom);

        const svg = d3
          .select(this)
          .on("mousemove", function() {
            const mx = d3.mouse(this)[0];
            const bisect = d3.bisector(d => x(d)).left;
            const i = bisect(allYears, mx, 1);
            const a = allYears[i - 1];
            const b = allYears[i];
            const year = mx - x(a) > x(b) - mx ? b : a;
            if (year !== selectedYear) {
              selectedYear = year;
              const tooltipData = lineData
                .reduce((tooltipData, d) => {
                  const yearData = d.value.find(e => e["Fiscal Year"] === year);
                  if (yearData) {
                    tooltipData.push(yearData);
                  }
                  return tooltipData;
                }, [])
                .sort((a, b) => d3.descending(a.Change, b.Change))
                .map(d => ({
                  hospital: d.Name,
                  value: d.Value,
                  change: d.Change
                }));
              svg
                .select(".focus")
                .style("display", "inline")
                .selectAll(".focus-circle")
                .style("display", d =>
                  d.value.find(e => e["Fiscal Year"] === year)
                    ? "inline"
                    : "none"
                )
                .attr("cx", d => {
                  const e = d.value.find(e => e["Fiscal Year"] === year);
                  return e ? x(e["Fiscal Year"]) : 0;
                })
                .attr("cy", d => {
                  const e = d.value.find(e => e["Fiscal Year"] === year);
                  return e ? y(e.Change) : 0;
                });

              let content = "<table><tbody>";
              tooltipData.forEach(d => {
                content += `
                  <tr style="color: ${color(d.hospital)}">
                    <td colspan="2">${d.hospital}</td>
                  </tr>
                  <tr style="color: ${color(d.hospital)}">
                    <td>${year}</td>
                    <td style="text-align:right">${(indicator.endsWith("Margin")
                      ? d3.format(".3f")
                      : d3.format("$,.2s"))(d.value)}</td>
                  </tr>
                  <tr style="color: ${color(d.hospital)}">
                    <td>Since ${allYears[0]}</td>
                    <td style="text-align:right">${d3.format("+,.0%")(
                      d.change
                    )}</td>
                  </tr>
                `;
              });
              content += "</tbody></table>";

              svg
                .select(".focus")
                .selectAll(".focus-circle")
                .filter(d => d.key === tooltipData[0].hospital)
                .each(function() {
                  const { x, y, width, height } = this.getBoundingClientRect();
                  tooltip.show(content, x + width / 2, y + height / 2);
                });
            }
          })
          .on("mouseleave", () => {
            selectedYear = null;
            svg.select(".focus").style("display", "none");
            tooltip.hide();
          });
        svg
          .select(".x.axis")
          .attr("transform", `translate(0,${y(0)})`)
          .call(d3.axisBottom(x).tickSizeOuter(0));
        svg.select(".y.axis").call(
          d3
            .axisLeft(y)
            .ticks(4, ",%")
            .tickSizeOuter(0)
            .tickPadding(9)
        );
        svg
          .select(".lines")
          .selectAll(".line")
          .data(lineData, d => d.key)
          .join("path")
          .attr("class", "line")
          .attr("fill", "none")
          .attr("stroke", d => color(d.key))
          .attr("stroke-width", 2)
          .attr("d", d => line(d.value));
        svg
          .select(".labels")
          .selectAll("text")
          .data(lineData, d => d.key)
          .join("text")
          .attr("dy", "0.31em")
          .attr("x", d => x(d.value[d.value.length - 1]["Fiscal Year"]) + 12)
          .attr("y", d => y(d.value[d.value.length - 1].Change))
          .attr("fill", d => color(d.key))
          .text(d => d3.format("+,.0%")(d.value[d.value.length - 1].Change));
        svg
          .select(".focus")
          .style("display", "none")
          .selectAll(".focus-circle")
          .data(lineData, d => d.key)
          .join("circle")
          .attr("class", "focus-circle")
          .attr("fill", "#fff")
          .attr("stroke", d => color(d.key))
          .attr("stroke-width", 2)
          .attr("r", 3);
      });
    }

    // Resize
    function updateDimension() {
      svgWidth = tab.node().clientWidth;
      width = svgWidth - margin.left - margin.right;

      x.range([0, width]);
    }
  }

  // Tooltip
  function initTooltip() {
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "chart-tooltip")
      .style("display", "none");
    let tooltipBox;

    function show(content, x, y) {
      tooltip.html(content).style("display", "block");
      tooltipBox = tooltip.node().getBoundingClientRect();
      if (x || y) {
        move(x, y);
      }
    }

    function hide() {
      tooltip.style("display", "none");
    }

    function move(x, y) {
      const padding = 6;
      let left = x + padding;
      if (left + tooltipBox.width > window.innerWidth) {
        left = x - padding - tooltipBox.width;
      }
      if (left < 0) {
        left = 0;
      }
      let top = y + padding;
      if (top + tooltipBox.height > window.innerHeight) {
        top = window.innerHeight - tooltipBox.height;
      }
      tooltip.style("transform", `translate(${left}px,${top}px)`);
    }

    return {
      show,
      hide,
      move
    };
  }
})();
