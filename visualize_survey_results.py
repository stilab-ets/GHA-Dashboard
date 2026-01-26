"""
Survey Results Visualization
Creates Likert scale charts for Usability and Usefulness sections,
plus experience distribution charts.
"""

import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from matplotlib.patches import Rectangle
import warnings
warnings.filterwarnings('ignore')

# Set style for modern, beautiful charts
sns.set_style("whitegrid")
plt.rcParams['font.size'] = 11
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['figure.facecolor'] = 'white'

# Color palette for Likert scale (more distinct greens)
LIKERT_COLORS = {
    'Very Unsatisfied': '#d32f2f',  # Red
    'Unsatisfied': '#f57c00',       # Orange
    'Neutral': '#fbc02d',           # Yellow
    'Satisfied': '#66bb6a',         # Light green (more distinct)
    'Very Satisfied': '#2e7d32'     # Dark green
}

# Satisfaction level order
SATISFACTION_ORDER = ['Very Unsatisfied', 'Unsatisfied', 'Neutral', 'Satisfied', 'Very Satisfied']
# Legend order (Very Unsatisfied before Unsatisfied)
LEGEND_ORDER = ['Very Unsatisfied', 'Unsatisfied', 'Neutral', 'Satisfied', 'Very Satisfied']


def load_data(csv_file='updated_feedback.csv'):
    """Load survey data from CSV."""
    df = pd.read_csv(csv_file)
    # Strip whitespace from column names
    df.columns = df.columns.str.strip()
    return df


def create_likert_chart(data, questions, labels, title, filename):
    """
    Create a centered stacked bar chart (Likert scale) for survey questions.
    Neutral is centered at 0%, negative responses go left, positive go right.
    Maximum 30% white space on each side.
    
    Args:
        data: DataFrame with survey responses
        questions: List of question column names
        labels: List of short labels for questions (for y-axis)
        title: Chart title
        filename: Output filename
    """
    # Count responses for each question
    question_data = []
    
    for question in questions:
        counts = data[question].value_counts().reindex(SATISFACTION_ORDER, fill_value=0)
        question_data.append(counts)
    
    # Create DataFrame for plotting
    plot_df = pd.DataFrame(question_data, index=labels)
    plot_df = plot_df.T  # Transpose so satisfaction levels are rows
    
    # Calculate percentages
    plot_df_pct = plot_df.div(plot_df.sum(axis=0), axis=1) * 100
    
    # Separate negative, neutral, and positive
    negative_levels = ['Very Unsatisfied', 'Unsatisfied']
    neutral_level = 'Neutral'
    positive_levels = ['Satisfied', 'Very Satisfied']
    
    # Calculate totals for each category
    negative_totals = plot_df_pct.loc[negative_levels].sum(axis=0) if all(l in plot_df_pct.index for l in negative_levels) else pd.Series(0, index=labels)
    neutral_values = plot_df_pct.loc[neutral_level] if neutral_level in plot_df_pct.index else pd.Series(0, index=labels)
    positive_totals = plot_df_pct.loc[positive_levels].sum(axis=0) if all(l in plot_df_pct.index for l in positive_levels) else pd.Series(0, index=labels)
    
    # Find maximum total width needed (negative + positive, ignoring neutral width)
    max_width = (negative_totals + positive_totals).max()
    # Scale to use maximum 70% of width (30% white space on each side)
    max_display_width = 70
    scale_factor = max_display_width / max_width if max_width > 0 else 1.0
    scale_factor = min(scale_factor, 1.0)

    # Scale the values
    negative_totals_scaled = negative_totals * scale_factor
    neutral_values_scaled = neutral_values * scale_factor
    positive_totals_scaled = positive_totals * scale_factor

    # Create figure
    fig, ax = plt.subplots(figsize=(12, 6.8))
    
    # Y positions
    y_positions = np.arange(len(labels))
    
    # Plot negative responses (left of center)
    negative_left = -negative_totals_scaled.copy()
    for level in reversed(negative_levels):  # Reverse to stack correctly
        if level in plot_df_pct.index:
            values = plot_df_pct.loc[level].values * scale_factor
            left_positions = negative_left
            ax.barh(y_positions, values, left=left_positions, label=level, 
                   color=LIKERT_COLORS[level], edgecolor='white', linewidth=1.5, height=0.7)
            
            # Add value labels
            for j, val in enumerate(values):
                if val > 2:  # Only show label if percentage > 2%
                    ax.text(left_positions[j] + val/2, j, f'{int(plot_df_pct.loc[level].iloc[j])}%', 
                           ha='center', va='center', fontweight='bold', color='white',
                           fontsize=16)
            
            negative_left += values
    
    # Plot neutral (centered at 0) - MUST be exactly centered at 0
    # Calculate neutral bar positions first
    if neutral_level in plot_df_pct.index:
        neutral_values_list = neutral_values_scaled.values
        # Neutral bar MUST be centered: left edge at -neutral/2, right edge at +neutral/2
        neutral_left_positions = -neutral_values_list / 2
        neutral_right_positions = neutral_values_list / 2
    else:
        neutral_left_positions = np.zeros(len(labels))
        neutral_right_positions = np.zeros(len(labels))
    
    # Plot neutral bar (draw it first so it's behind other bars if needed)
    if neutral_level in plot_df_pct.index:
        ax.barh(y_positions, neutral_values_list, left=neutral_left_positions, 
               label=neutral_level, color=LIKERT_COLORS[neutral_level], 
               edgecolor='white', linewidth=1.5, height=0.7, zorder=1)
        
        # Add value labels at exactly 0
        for j, val in enumerate(neutral_values_list):
            if val > 2:  # Only show label if percentage > 2%
                ax.text(0, j, f'{int(neutral_values.iloc[j])}%', 
                       ha='center', va='center', fontweight='bold', color='black',
                       fontsize=18)
    
    # Plot positive responses (right of center)
    # Positive bars start at +neutral/2 (where neutral bar ends on the right)
    positive_left = neutral_right_positions.copy()
    for level in positive_levels:
        if level in plot_df_pct.index:
            values = plot_df_pct.loc[level].values * scale_factor
            ax.barh(y_positions, values, left=positive_left, label=level, 
                   color=LIKERT_COLORS[level], edgecolor='white', linewidth=1.5, height=0.7)
            
            # Add value labels
            for j, val in enumerate(values):
                if val > 2:  # Only show label if percentage > 2%
                    ax.text(positive_left[j] + val/2, j, f'{int(plot_df_pct.loc[level].iloc[j])}%', 
                           ha='center', va='center', fontweight='bold', color='white',
                           fontsize=18)
            
            positive_left += values
    
    # Customize chart - centered axis
    # Limit left side to -20% max (since there's no negative data, just white space)
    max_range_right = max(positive_totals_scaled.max(), 35)
    max_range_left = min(20, max_range_right)  # Cap left side at 20%
    ax.set_xlim(-max_range_left - 5, max_range_right + 5)  # Add padding
    
    # Set x-axis labels
    # Left side: from -max_range_left to 0, right side: from 0 to max_range_right
    left_ticks = np.arange(-max_range_left, 1, 10)
    right_ticks = np.arange(0, max_range_right + 5, 10)
    # Combine and remove duplicates at 0
    all_ticks = np.concatenate([left_ticks[left_ticks < 0], [0], right_ticks[right_ticks > 0]])
    ax.set_xticks(all_ticks)
    ax.set_xticklabels([f'{abs(int(x))}%' if x < 0 else f'{int(x)}%' for x in all_ticks], fontsize=11)
    
    # Add vertical line at 0
    ax.axvline(x=0, color='black', linewidth=2, linestyle='-', alpha=0.3)
    
    # Set labels (bigger and bold)
    ax.set_xlabel('Percentage of Responses (%)', fontsize=16, fontweight='bold', labelpad=16)
    ax.set_yticks(y_positions)
    ax.set_yticklabels(labels, fontsize=15, fontweight='bold')
    # Removed title as requested
    ax.grid(axis='x', alpha=0.3, linestyle='--', zorder=0)
    ax.set_axisbelow(True)
    
    # Add legend - bigger and lower (moved further down to not cover x-axis label)
    # Create legend with custom order (Unsatisfied before Very Unsatisfied)
    handles, labels_legend = ax.get_legend_handles_labels()
    # Reorder legend items: Unsatisfied, Very Unsatisfied, Neutral, Satisfied, Very Satisfied
    legend_dict = dict(zip(labels_legend, handles))
    ordered_handles = [legend_dict.get(label, None) for label in LEGEND_ORDER if label in legend_dict]
    ordered_labels = [label for label in LEGEND_ORDER if label in legend_dict]
    
    legend = ax.legend(ordered_handles, ordered_labels, loc='lower center', frameon=True, fancybox=True, shadow=True, 
             ncol=5, bbox_to_anchor=(0.5, -0.35), fontsize=14, 
             columnspacing=2.0, handlelength=2.5, handletextpad=0.8)
    # Make legend markers bigger
    for handle in legend.legend_handles:
        if hasattr(handle, 'set_sizes'):
            handle.set_sizes([150])  # Make markers bigger
        if hasattr(handle, 'set_markersize'):
            handle.set_markersize(15)
    
    # Remove top and right spines
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#cccccc')
    ax.spines['bottom'].set_color('#cccccc')
    
    plt.tight_layout(rect=[0, 0.12, 1, 1])  # Increased bottom margin for legend
    plt.savefig(filename, dpi=300, bbox_inches='tight', facecolor='white')
    print(f"✓ Saved: {filename}")
    plt.close()


def create_software_dev_experience_chart(data, filename='software_dev_experience_chart.png'):
    """Create bar chart for Software Development Experience."""
    # Software Development Experience
    dev_exp = data['Years of Experience in Software Development:'].value_counts()
    total = len(data)
    
    # Print results
    print("\n" + "=" * 60)
    print("Software Development Experience Results")
    print("=" * 60)
    print(f"{'Years Experience':<25} {'Participants':<15} {'Percentage':<15}")
    print("-" * 60)
    for years, count in dev_exp.items():
        percentage = (count / total) * 100
        print(f"{str(years):<25} {int(count):<15} {percentage:.1f}%")
    print(f"{'Total':<25} {total:<15} {'100.0%':<15}")
    print("=" * 60)
    
    fig, ax = plt.subplots(figsize=(10, 7))
    colors = sns.color_palette("viridis", len(dev_exp))
    bars = ax.bar(range(len(dev_exp)), dev_exp.values, color=colors, 
                   edgecolor='white', linewidth=2.5)
    ax.set_xticks(range(len(dev_exp)))
    ax.set_xticklabels(dev_exp.index, rotation=45, ha='right', fontsize=18, fontweight='bold')
    ax.set_ylabel('Number of Participants', fontsize=20, fontweight='bold')
    ax.set_xlabel('Years of Experience', fontsize=20, fontweight='bold')
    ax.grid(axis='y', alpha=0.3, linestyle='--')
    ax.set_axisbelow(True)
    
    # Add value labels on bars with percentages (much bigger)
    for i, bar in enumerate(bars):
        height = bar.get_height()
        percentage = (height / total) * 100
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.1,
                f'{int(height)} ({percentage:.1f}%)',
                ha='center', va='bottom', fontweight='bold', fontsize=26)
    
    # Remove top and right spines
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#cccccc')
    ax.spines['bottom'].set_color('#cccccc')
    
    # Make tick labels bigger
    ax.tick_params(axis='y', labelsize=16, labelcolor='black')
    
    plt.tight_layout()
    plt.savefig(filename, dpi=300, bbox_inches='tight', facecolor='white')
    print(f"✓ Saved: {filename}")
    plt.close()


def create_workflow_experience_chart(data, filename='workflow_experience_chart.png'):
    """Create bar chart for Workflow/Pipeline Experience."""
    # Workflow/Pipeline Experience
    workflow_exp = data['Years of Experience in automated Workflows / Pipelines:'].value_counts()
    total = len(data)
    
    # Print results
    print("\n" + "=" * 60)
    print("Workflow/Pipeline Experience Results")
    print("=" * 60)
    print(f"{'Years Experience':<25} {'Participants':<15} {'Percentage':<15}")
    print("-" * 60)
    for years, count in workflow_exp.items():
        percentage = (count / total) * 100
        print(f"{str(years):<25} {int(count):<15} {percentage:.1f}%")
    print(f"{'Total':<25} {total:<15} {'100.0%':<15}")
    print("=" * 60)
    
    fig, ax = plt.subplots(figsize=(10, 7))
    colors = sns.color_palette("plasma", len(workflow_exp))
    bars = ax.bar(range(len(workflow_exp)), workflow_exp.values, color=colors,
                   edgecolor='white', linewidth=2.5)
    ax.set_xticks(range(len(workflow_exp)))
    ax.set_xticklabels(workflow_exp.index, rotation=45, ha='right', fontsize=18, fontweight='bold')
    ax.set_ylabel('Number of Participants', fontsize=20, fontweight='bold')
    ax.set_xlabel('Years of Experience', fontsize=20, fontweight='bold')
    ax.grid(axis='y', alpha=0.3, linestyle='--')
    ax.set_axisbelow(True)
    
    # Add value labels on bars with percentages (much bigger)
    for i, bar in enumerate(bars):
        height = bar.get_height()
        percentage = (height / total) * 100
        ax.text(bar.get_x() + bar.get_width()/2., height + 0.1,
                f'{int(height)} ({percentage:.1f}%)',
                ha='center', va='bottom', fontweight='bold', fontsize=26)
    
    # Remove top and right spines
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['left'].set_color('#cccccc')
    ax.spines['bottom'].set_color('#cccccc')
    
    # Make tick labels bigger
    ax.tick_params(axis='y', labelsize=16, labelcolor='black')
    
    plt.tight_layout()
    plt.savefig(filename, dpi=300, bbox_inches='tight', facecolor='white')
    print(f"✓ Saved: {filename}")
    plt.close()


def create_experience_pie_charts(data, filename='experience_pie_charts.png'):
    """Create pie charts for years of experience."""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 7))
    
    # Software Development Experience
    dev_exp = data['Years of Experience in Software Development:'].value_counts()
    colors1 = sns.color_palette("viridis", len(dev_exp))
    
    wedges1, texts1, autotexts1 = ax1.pie(dev_exp.values, labels=dev_exp.index, autopct='%1.1f%%',
                                         colors=colors1, startangle=90,
                                         textprops={'fontsize': 14, 'fontweight': 'bold'},
                                         explode=[0.05] * len(dev_exp))
    
    # Customize autopct text
    for autotext in autotexts1:
        autotext.set_color('white')
        autotext.set_fontweight('bold')
        autotext.set_fontsize(14)
    
    # Removed title as requested
    
    # Workflow/Pipeline Experience
    workflow_exp = data['Years of Experience in automated Workflows / Pipelines:'].value_counts()
    colors2 = sns.color_palette("plasma", len(workflow_exp))
    
    wedges2, texts2, autotexts2 = ax2.pie(workflow_exp.values, labels=workflow_exp.index, autopct='%1.1f%%',
                                         colors=colors2, startangle=90,
                                         textprops={'fontsize': 14, 'fontweight': 'bold'},
                                         explode=[0.05] * len(workflow_exp))
    
    # Customize autopct text
    for autotext in autotexts2:
        autotext.set_color('white')
        autotext.set_fontweight('bold')
        autotext.set_fontsize(14)
    
    # Removed title as requested
    
    plt.tight_layout()
    plt.savefig(filename, dpi=300, bbox_inches='tight', facecolor='white')
    print(f"✓ Saved: {filename}")
    plt.close()


def find_column_name(df, partial_name):
    """Find column name that contains the partial name."""
    matches = [col for col in df.columns if partial_name.lower() in col.lower()]
    if matches:
        return matches[0]
    return None


def main():
    """Main function to generate all visualizations."""
    print("=" * 60)
    print("Survey Results Visualization")
    print("=" * 60)
    print()
    
    # Load data
    print("Loading survey data...")
    df = load_data('feedback_latest.csv')
    print(f"✓ Loaded {len(df)} responses\n")
    
    # Find column names dynamically
    # Define Usability questions and short labels
    usability_questions = [
        find_column_name(df, "easy it was to set up"),
        find_column_name(df, "clarity and helpfulness"),
        find_column_name(df, "easy GHA-Dashboard was to use"),
        find_column_name(df, "waiting time to load"),
        find_column_name(df, "clearly the dashboard explains")
    ]
    
    usability_labels = [
        "Setup Ease",
        "Documentation Quality",
        "Ease of Use",
        "Loading Time",
        "Chart Clarity"
    ]
    
    # Define Usefulness questions and short labels
    usefulness_questions = [
        find_column_name(df, "CI performance of the repository"),
        find_column_name(df, "usefulness of the metrics"),
        find_column_name(df, "insights provided by GHA-Dashboard compared"),
        find_column_name(df, "tool for analyzing CI workflows")
    ]
    
    usefulness_labels = [
        "CI Performance Understanding",
        "Metrics Usefulness",
        "Insights vs GitHub",
        "Workflow Analysis Tool"
    ]
    
    # Filter out None values (columns not found)
    usability_data = [(q, l) for q, l in zip(usability_questions, usability_labels) if q is not None]
    usefulness_data = [(q, l) for q, l in zip(usefulness_questions, usefulness_labels) if q is not None]
    
    if not usability_data:
        print("Error: Could not find usability question columns")
        return
    if not usefulness_data:
        print("Error: Could not find usefulness question columns")
        return
    
    usability_questions_clean, usability_labels_clean = zip(*usability_data)
    usefulness_questions_clean, usefulness_labels_clean = zip(*usefulness_data)
    
    # Create Likert charts
    print("Creating Likert scale charts...")
    create_likert_chart(
        df, 
        list(usability_questions_clean), 
        list(usability_labels_clean),
        "Usability of GHA-Dashboard",
        "usability_likert_chart.png"
    )
    
    create_likert_chart(
        df,
        list(usefulness_questions_clean),
        list(usefulness_labels_clean),
        "Usefulness of GHA-Dashboard",
        "usefulness_likert_chart.png"
    )
    
    # Create experience charts (separate files)
    print("\nCreating experience distribution charts...")
    create_software_dev_experience_chart(df, "software_dev_experience_chart.png")
    create_workflow_experience_chart(df, "workflow_experience_chart.png")
    create_experience_pie_charts(df, "experience_pie_charts.png")
    
    print("\n" + "=" * 60)
    print("All visualizations generated successfully!")
    print("=" * 60)
    print("\nGenerated files:")
    print("  - usability_likert_chart.png")
    print("  - usefulness_likert_chart.png")
    print("  - software_dev_experience_chart.png")
    print("  - workflow_experience_chart.png")
    print("  - experience_pie_charts.png")


if __name__ == "__main__":
    main()

